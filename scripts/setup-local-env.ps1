<#
.SYNOPSIS
    Generates the CreatorCore local-development root .env file safely.

.DESCRIPTION
    CreatorCore's local dev environment uses a single root .env file
    (docs/adr/0008-deployment-runtime-model.md: "local (docker-compose MySQL
    + all three apps against a local .env)"; loaded today by
    scripts/check-test-gate.mjs and the apps/api + packages/db integration
    test suites via Node's native process.loadEnvFile). This script does
    NOT redesign that loading behavior -- it only populates the file it
    already expects, at the path it already looks for (repo root .env).

    It generates every value that can safely be generated on this machine:
      - WORKER_TOKEN_SIGNING_KEY        (packages/config/src/api.ts: min 32 chars)
      - BOT_CREDENTIAL_ENCRYPTION_KEY    (canonical base64url, 32 decoded bytes)
      - BETTER_AUTH_SECRET               (min 32 chars)
      - DISCORD_OAUTH_TOKEN_ENCRYPTION_KEY (canonical base64url, 32 decoded bytes,
                                             independent key domain from every
                                             other secret -- Amendment 1)
      - WORKER_ID                        (stable UUID, generated once)
      - safe local defaults (NODE_ENV, LOG_LEVEL, PORT, WEB_APP_ORIGIN,
        API_BASE_URL, API_INTERNAL_URL, NEXT_PUBLIC_APP_NAME)

    It deliberately leaves blank, with MANUAL comments, the three values that
    come from external systems the operator controls:
      - DATABASE_URL          (your own MySQL 8.0+ instance)
      - DISCORD_CLIENT_ID     (Discord Developer Portal)
      - DISCORD_CLIENT_SECRET (Discord Developer Portal)

    It never generates fake *_PREVIOUS rotation values -- those are genuinely
    optional (packages/config/src/api.ts's superRefine only requires a
    PREVIOUS key/version pair to be internally consistent when present at
    all) and a brand-new local install has nothing to rotate from yet.

    Secret VALUES are never printed, logged, or written anywhere except the
    target env file itself.

.PARAMETER Path
    Target env file path. Defaults to the repo-root ".env" -- the file
    CreatorCore's own tooling (scripts/check-test-gate.mjs, the integration
    test suites) already loads. Overriding this is intended for this
    script's own safe validation runs against a throwaway file, not for
    routine use -- CreatorCore does not load ".env.local" or any other name.

.PARAMETER Force
    Allows regenerating an existing target file. The existing file is first
    backed up (timestamped, alongside the target -- still git-ignored by the
    repo's ".env.*" rule) rather than being silently discarded.

.PARAMETER DryRun
    Prints what would happen (target path, which variables would be
    generated vs. left blank) without writing or backing up anything.

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File scripts/setup-local-env.ps1

.EXAMPLE
    pnpm env:setup
#>

[CmdletBinding()]
param(
    [string]$Path,
    [switch]$Force,
    [switch]$DryRun
)

$ErrorActionPreference = "Stop"

function Write-Section {
    param([string]$Text)
    Write-Host ""
    Write-Host "== $Text ==" -ForegroundColor Cyan
}

function Get-RepoRoot {
    # This script lives at <repoRoot>/scripts/setup-local-env.ps1.
    return (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
}

function Assert-GitAvailable {
    $gitCmd = Get-Command git -ErrorAction SilentlyContinue
    if (-not $gitCmd) {
        # Check standard Windows Git locations if terminal session hasn't refreshed PATH yet
        $candidates = @(
            "C:\Program Files\Git\cmd",
            "C:\Program Files (x86)\Git\cmd",
            (Join-Path $env:LOCALAPPDATA "Programs\Git\cmd")
        )
        foreach ($dir in $candidates) {
            if (Test-Path (Join-Path $dir "git.exe")) {
                $env:Path = "$dir;$env:Path"
                $gitCmd = Get-Command git -ErrorAction SilentlyContinue
                if ($gitCmd) { break }
            }
        }
    }
    if (-not $gitCmd) {
        throw "git is required to verify this file is safely ignored, but was not found on PATH. Aborting without writing anything."
    }
}

function Test-PathGitIgnored {
    param([string]$RepoRoot, [string]$TargetPath)

    Push-Location $RepoRoot
    try {
        # [System.IO.Path]::GetRelativePath doesn't exist on the .NET
        # Framework that backs Windows PowerShell 5.1 -- compute it manually.
        # RepoRoot/TargetPath are both already full, normalized paths.
        $normalizedRoot = $RepoRoot.TrimEnd('\', '/')
        if ($TargetPath.StartsWith($normalizedRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
            $relative = $TargetPath.Substring($normalizedRoot.Length).TrimStart('\', '/') -replace '\\', '/'
        }
        else {
            $relative = $TargetPath -replace '\\', '/'
        }

        # Fail safe: if the path is already tracked by git, no ignore rule
        # protects it from a future `git add`/commit -- refuse regardless of
        # what .gitignore says.
        #
        # Both git calls below are EXPECTED to exit non-zero on the common
        # path (untracked / ignored file) -- that is success for our check,
        # not a failure. Under $ErrorActionPreference = "Stop", redirecting a
        # native command's stderr (even to $null) turns that non-zero exit
        # into a terminating NativeCommandError, so stderr is captured into a
        # local variable via cmd-style redirection instead, and
        # ErrorActionPreference is relaxed just for these two calls.
        $previousEap = $ErrorActionPreference
        $ErrorActionPreference = "Continue"
        try {
            $null = & git ls-files --error-unmatch -- $relative 2>&1
            $tracked = ($LASTEXITCODE -eq 0)

            $null = & git check-ignore -q -- $relative 2>&1
            $ignored = ($LASTEXITCODE -eq 0)
        }
        finally {
            $ErrorActionPreference = $previousEap
        }

        if ($tracked) {
            return @{ Safe = $false; Reason = "the file is already tracked by git (git ls-files finds it) -- an ignore rule cannot protect a tracked file" }
        }
        if (-not $ignored) {
            return @{ Safe = $false; Reason = "the file is not covered by any .gitignore rule (git check-ignore found none) -- add one before generating secrets here" }
        }

        return @{ Safe = $true; Reason = "git check-ignore confirms the file is ignored, and it is not tracked" }
    }
    finally {
        Pop-Location
    }
}

function New-CryptoBytes {
    param([int]$Length)
    $bytes = New-Object byte[] $Length
    $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    try {
        $rng.GetBytes($bytes)
    }
    finally {
        $rng.Dispose()
    }
    return $bytes
}

function ConvertTo-Base64Url {
    param([byte[]]$Bytes)
    $b64 = [Convert]::ToBase64String($Bytes)
    return $b64.Replace('+', '-').Replace('/', '_').TrimEnd('=')
}

# Canonical unpadded base64url encoding of 32 random bytes -- matches
# packages/config/src/api.ts's isValidBase64Url32: exactly 43 chars from
# [A-Za-z0-9_-], and Buffer.from(val, "base64url").toString("base64url")
# round-trips to the same string (guaranteed here because we encode with
# the base64url alphabet ourselves, never emit '+'/'/' or padding).
function New-Base64UrlKey32 {
    return ConvertTo-Base64Url (New-CryptoBytes 32)
}

# High-entropy secret for fields that only require a minimum length
# (WORKER_TOKEN_SIGNING_KEY, BETTER_AUTH_SECRET both require >= 32 chars,
# no encoding format). 32 random bytes hex-encoded (64 chars) follows the
# exact convention packages/db/src/lib/secret-hash.ts's generateSecret()
# already uses for worker bootstrap secrets -- reusing the established
# pattern rather than inventing a new one.
function New-HexSecret {
    param([int]$ByteLength = 32)
    $bytes = New-CryptoBytes $ByteLength
    return -join ($bytes | ForEach-Object { $_.ToString('x2') })
}

function New-StableWorkerId {
    return [guid]::NewGuid().ToString()
}

$repoRoot = Get-RepoRoot
if (-not $Path) {
    $Path = Join-Path $repoRoot ".env"
}
elseif (-not [System.IO.Path]::IsPathRooted($Path)) {
    # A bare/relative -Path (e.g. for a throwaway validation file) is
    # anchored to the repo root, never to whatever directory the script
    # happened to be invoked from.
    $Path = Join-Path $repoRoot $Path
}
# Normalize to a full path even if the file doesn't exist yet.
$targetPath = [System.IO.Path]::GetFullPath($Path)
$resolvedTargetDir = Split-Path -Parent $targetPath
if (-not (Test-Path $resolvedTargetDir)) {
    throw "Target directory does not exist: $resolvedTargetDir"
}

Write-Section "CreatorCore local environment bootstrap"
Write-Host "Target file: $targetPath"

Assert-GitAvailable
$ignoreCheck = Test-PathGitIgnored -RepoRoot $repoRoot -TargetPath $targetPath
if (-not $ignoreCheck.Safe) {
    throw "Refusing to write $targetPath -- $($ignoreCheck.Reason)."
}
Write-Host "Git safety check: OK ($($ignoreCheck.Reason))" -ForegroundColor Green

$fileExists = Test-Path $targetPath
if ($fileExists) {
    # Refuse to write through a symlink/junction/hardlink at the target path.
    # An untracked reparse point sitting at $targetPath could itself be
    # git-ignored and untracked (passing the check above) while resolving to
    # a completely different, possibly-tracked file elsewhere -- writing
    # freshly generated secrets through it would land them somewhere this
    # script never validated.
    $existingItem = Get-Item -Path $targetPath -Force
    if ($existingItem.LinkType) {
        throw "Refusing to write $targetPath -- it is a $($existingItem.LinkType) (reparse point), not a plain file. Remove it and re-run if you intend to create a fresh env file here."
    }
}
if ($fileExists -and -not $Force) {
    Write-Host ""
    Write-Host "SKIPPED: $targetPath already exists." -ForegroundColor Yellow
    Write-Host "No changes were made. Re-run with -Force to regenerate (the existing file is backed up first, never overwritten silently)."
    exit 0
}

# ---------------------------------------------------------------------------
# Generate every value that can safely be generated locally. Nothing here is
# printed, logged, or written to a variable that outlives this process except
# inside $envLines, which only ever gets written to $targetPath.
# ---------------------------------------------------------------------------
$workerTokenSigningKey    = New-HexSecret 32
$botCredentialKey         = New-Base64UrlKey32
$betterAuthSecret         = New-HexSecret 32
$discordOauthTokenKey     = New-Base64UrlKey32
$workerId                 = New-StableWorkerId

# Defensive independence check (docs/adr/0007 Amendment 1 / api.ts's
# superRefine already enforces this at load time -- this is a cheap belt-
# and-braces check at generation time so a bootstrap bug can never silently
# hand back two identical secrets).
$generatedSecrets = @(
    @{ Name = "WORKER_TOKEN_SIGNING_KEY"; Value = $workerTokenSigningKey }
    @{ Name = "BOT_CREDENTIAL_ENCRYPTION_KEY"; Value = $botCredentialKey }
    @{ Name = "BETTER_AUTH_SECRET"; Value = $betterAuthSecret }
    @{ Name = "DISCORD_OAUTH_TOKEN_ENCRYPTION_KEY"; Value = $discordOauthTokenKey }
)
for ($i = 0; $i -lt $generatedSecrets.Count; $i++) {
    for ($j = $i + 1; $j -lt $generatedSecrets.Count; $j++) {
        if ($generatedSecrets[$i].Value -eq $generatedSecrets[$j].Value) {
            throw "Internal error: $($generatedSecrets[$i].Name) and $($generatedSecrets[$j].Name) were generated with identical values. Aborting -- this must never happen with a working CSPRNG."
        }
    }
}

if ($DryRun) {
    Write-Section "Dry run -- no file written"
    Write-Host "Would generate: WORKER_TOKEN_SIGNING_KEY, BOT_CREDENTIAL_ENCRYPTION_KEY, BETTER_AUTH_SECRET, DISCORD_OAUTH_TOKEN_ENCRYPTION_KEY, WORKER_ID"
    Write-Host "Would leave blank (manual): DATABASE_URL, DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET"
    exit 0
}

if ($fileExists -and $Force) {
    $backupPath = "$targetPath.bak.$(Get-Date -Format 'yyyyMMdd-HHmmss')"
    # Re-run the same git safety check against the derived backup path --
    # $targetPath being ignored (e.g. via an exact-name .gitignore rule)
    # does not guarantee a sibling "<name>.bak.<timestamp>" path is too.
    # Only the repo's ".env.*" wildcard makes the default ".env" target
    # safe here; a custom -Path could use a narrower rule.
    $backupIgnoreCheck = Test-PathGitIgnored -RepoRoot $repoRoot -TargetPath $backupPath
    if (-not $backupIgnoreCheck.Safe) {
        throw "Refusing to create backup $backupPath -- $($backupIgnoreCheck.Reason). Re-run without -Force, or widen .gitignore to cover the backup path, before regenerating."
    }
    Copy-Item -Path $targetPath -Destination $backupPath -Force
    Write-Host "Existing file backed up to: $backupPath" -ForegroundColor Yellow
}

# ---------------------------------------------------------------------------
# Compose the env file. Structure mirrors .env.example's grouping. Shared
# names (NODE_ENV, LOG_LEVEL) are written once -- this is one root .env
# consumed by all three apps' own schemas, not per-app files.
# ---------------------------------------------------------------------------
$generatedAt = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss K")
$lines = New-Object System.Collections.Generic.List[string]

$lines.Add("# CreatorCore local development environment")
$lines.Add("# Generated by scripts/setup-local-env.ps1 on $generatedAt")
$lines.Add("# This file is git-ignored (.gitignore: '.env' / '.env.*') -- never commit it.")
$lines.Add("# See docs/DEVELOPMENT.md for the full local setup flow.")
$lines.Add("")

$lines.Add("# --- MANUAL: values only you can provide (external systems) ---")
$lines.Add("")
$lines.Add("# MANUAL: your local MySQL 8.0+ connection string (docs/DATABASE_RULES.md).")
$lines.Add("# Format: mysql://username:password@host:3306/database")
$lines.Add("DATABASE_URL=")
$lines.Add("")
$lines.Add("# MANUAL: Discord Developer Portal -> your CreatorCore application -> OAuth2 -> Client ID")
$lines.Add("DISCORD_CLIENT_ID=")
$lines.Add("")
$lines.Add("# MANUAL: Discord Developer Portal -> your CreatorCore application -> OAuth2 -> Client Secret")
$lines.Add("# See docs/DEVELOPMENT.md for the exact redirect/callback URL to register alongside it.")
$lines.Add("DISCORD_CLIENT_SECRET=")
$lines.Add("")

$lines.Add("# --- Shared local defaults ---")
$lines.Add("")
$lines.Add("NODE_ENV=development")
$lines.Add("LOG_LEVEL=info")
$lines.Add("")

$lines.Add("# --- apps/api ---")
$lines.Add("")
$lines.Add("PORT=8787")
$lines.Add("")
$lines.Add("# AUTO-GENERATED locally: worker internal service-auth signing key")
$lines.Add("# (docs/adr/0011). apps/api only -- never provisioned to apps/worker.")
$lines.Add("WORKER_TOKEN_SIGNING_KEY=$workerTokenSigningKey")
$lines.Add("WORKER_TOKEN_SIGNING_KEY_VERSION=1")
$lines.Add("# WORKER_TOKEN_SIGNING_KEY_PREVIOUS=   # optional -- only set during a key rotation cutover")
$lines.Add("")
$lines.Add("# AUTO-GENERATED locally: bot-credential envelope encryption key (docs/adr/0007).")
$lines.Add("# Canonical base64url, exactly 32 decoded bytes. apps/api only.")
$lines.Add("BOT_CREDENTIAL_ENCRYPTION_KEY=$botCredentialKey")
$lines.Add("BOT_CREDENTIAL_ENCRYPTION_KEY_VERSION=1")
$lines.Add("# BOT_CREDENTIAL_ENCRYPTION_KEY_PREVIOUS=            # optional -- rotation only")
$lines.Add("# BOT_CREDENTIAL_ENCRYPTION_KEY_PREVIOUS_VERSION=    # optional -- rotation only")
$lines.Add("")
$lines.Add("# AUTO-GENERATED locally: Better Auth session/cookie signing secret (docs/adr/0003).")
$lines.Add("BETTER_AUTH_SECRET=$betterAuthSecret")
$lines.Add("")
$lines.Add("# The public web-facing origin -- Better Auth's baseURL and the CSRF")
$lines.Add("# origin-check allowlist both use this single value. Never apps/api's own address.")
$lines.Add("WEB_APP_ORIGIN=http://localhost:3000")
$lines.Add("")
$lines.Add("# AUTO-GENERATED locally: Discord OAuth-token envelope encryption key (Amendment 1).")
$lines.Add("# A key domain wholly independent of every other secret above. Canonical base64url, 32 bytes.")
$lines.Add("DISCORD_OAUTH_TOKEN_ENCRYPTION_KEY=$discordOauthTokenKey")
$lines.Add("DISCORD_OAUTH_TOKEN_ENCRYPTION_KEY_VERSION=1")
$lines.Add("# DISCORD_OAUTH_TOKEN_ENCRYPTION_KEY_PREVIOUS=            # optional -- rotation only")
$lines.Add("# DISCORD_OAUTH_TOKEN_ENCRYPTION_KEY_PREVIOUS_VERSION=    # optional -- rotation only")
$lines.Add("")

$lines.Add("# --- apps/worker ---")
$lines.Add("")
$lines.Add("# AUTO-GENERATED locally: stable worker identifier (generated once, never")
$lines.Add("# regenerated by this script on subsequent runs without -Force). Note: this ID")
$lines.Add("# alone does not let the worker complete its bootstrap exchange (docs/adr/0011)")
$lines.Add("# -- apps/api only accepts a worker ID that has a matching row provisioned in")
$lines.Add("# the database (packages/db's provisionWorker()), which also mints the")
$lines.Add("# WORKER_BOOTSTRAP_SECRET this worker would need. No script wires that up yet")
$lines.Add("# (packages/db/src/repositories/workers.ts: 'No HTTP route exposes this in")
$lines.Add("# Phase 3'). Until that provisioning step exists, apps/worker starts and runs")
$lines.Add("# its heartbeat, but never attempts the control-plane exchange, exactly as it")
$lines.Add("# does today with WORKER_ID unset -- see apps/worker/src/index.ts.")
$lines.Add("WORKER_ID=$workerId")
$lines.Add("# WORKER_BOOTSTRAP_SECRET=   # not generated here -- see comment above; requires DB-side provisioning first")
$lines.Add("API_BASE_URL=http://localhost:8787")
$lines.Add("")

$lines.Add("# --- apps/web (browser-safe only -- never a server secret) ---")
$lines.Add("")
$lines.Add("NEXT_PUBLIC_APP_NAME=CreatorCore")
$lines.Add("")

$lines.Add("# --- apps/web: server-only (never NEXT_PUBLIC_, never imported from a")
$lines.Add("# 'use client' component -- @creatorcore/config/web-server) ---")
$lines.Add("")
$lines.Add("# apps/api's internal (non-public) address, used only in Server Actions/Route")
$lines.Add("# Handlers to forward the session cookie/Origin header server-to-server.")
$lines.Add("API_INTERNAL_URL=http://localhost:8787")
$lines.Add("")

$content = ($lines -join "`n")
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($targetPath, $content, $utf8NoBom)

Write-Section "Done"
Write-Host "Wrote: $targetPath"
Write-Host ""
Write-Host "Generated (values not shown):"
Write-Host "  WORKER_TOKEN_SIGNING_KEY: generated"
Write-Host "  BOT_CREDENTIAL_ENCRYPTION_KEY: generated"
Write-Host "  BETTER_AUTH_SECRET: generated"
Write-Host "  DISCORD_OAUTH_TOKEN_ENCRYPTION_KEY: generated"
Write-Host "  WORKER_ID: generated"
Write-Host ""
Write-Host "Left blank -- fill in manually:"
Write-Host "  DATABASE_URL"
Write-Host "  DISCORD_CLIENT_ID"
Write-Host "  DISCORD_CLIENT_SECRET"
Write-Host ""
Write-Host "Next: open $targetPath, fill in the three MANUAL values, then see docs/DEVELOPMENT.md" -ForegroundColor Cyan
Write-Host "for the exact Discord OAuth redirect/callback URL to register in the Discord Developer Portal." -ForegroundColor Cyan
