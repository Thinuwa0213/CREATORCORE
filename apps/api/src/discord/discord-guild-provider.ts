import {
  findDiscordOauthCredential,
  replaceDiscordOauthCredentialIfUnchanged,
  type DatabaseClient,
} from "@creatorcore/db";
import {
  decryptDiscordOauthCredential,
  encryptDiscordOauthCredential,
  type DiscordOauthTokenEncryptionKeys,
} from "../lib/credential-crypto.js";
import { hasGuildManagePermission } from "./permissions.js";
import { DiscordUnavailableError, type DiscordGuildProvider, type ManageableGuild } from "./types.js";

interface DiscordGuildApiRow {
  id: string;
  name: string;
  permissions: string;
}

interface StoredOauthPayload {
  accessToken: string;
  refreshToken: string | null;
}

interface DiscordRefreshResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
}

export interface HttpDiscordGuildProviderOptions {
  db: DatabaseClient["db"];
  keys: DiscordOauthTokenEncryptionKeys;
  discordClientId: string;
  discordClientSecret: string;
  fetchFn?: typeof fetch;
  apiBaseUrl?: string;
  tokenEndpoint?: string;
  timeoutMs?: number;
  /** Read-only cache bound for listManageableGuilds only (ADR-0003: max 5 minutes). */
  readCacheTtlMs?: number;
}

/** Refresh a little before actual expiry so a request never races the deadline itself. */
const REFRESH_SKEW_MS = 60_000;

/**
 * Real Discord REST implementation of `DiscordGuildProvider`. Reads/writes
 * the encrypted credential directly via `@creatorcore/db`'s
 * discord-oauth-credentials repository (never Better Auth's own OAuth
 * helper — see the Phase 5 design doc's Step 0 finding) and refreshes
 * expiring tokens itself against Discord's token endpoint.
 *
 * Concurrency: the refresh path never holds a database transaction/lock
 * across the live Discord network call (security-review M2). It reads the
 * credential once, and if a refresh is needed, writes the result back with
 * an optimistic compare-and-swap keyed on the row's `updatedAt` — if a
 * concurrent request already won that race (or already consumed the same
 * rotating Discord refresh token, causing this call's own refresh attempt
 * to fail), it re-reads and uses the winner's credential instead of
 * retrying with an already-invalidated refresh token.
 */
export class HttpDiscordGuildProvider implements DiscordGuildProvider {
  private readonly db: DatabaseClient["db"];
  private readonly keys: DiscordOauthTokenEncryptionKeys;
  private readonly discordClientId: string;
  private readonly discordClientSecret: string;
  private readonly fetchFn: typeof fetch;
  private readonly apiBaseUrl: string;
  private readonly tokenEndpoint: string;
  private readonly timeoutMs: number;
  private readonly readCacheTtlMs: number;
  private readonly readCache = new Map<string, { guilds: ManageableGuild[]; checkedAt: number }>();

  constructor(options: HttpDiscordGuildProviderOptions) {
    this.db = options.db;
    this.keys = options.keys;
    this.discordClientId = options.discordClientId;
    this.discordClientSecret = options.discordClientSecret;
    this.fetchFn = options.fetchFn ?? fetch;
    this.apiBaseUrl = options.apiBaseUrl ?? "https://discord.com/api/v10";
    this.tokenEndpoint = options.tokenEndpoint ?? "https://discord.com/api/oauth2/token";
    this.timeoutMs = options.timeoutMs ?? 5_000;
    this.readCacheTtlMs = options.readCacheTtlMs ?? 5 * 60_000;
  }

  /**
   * Read-only, may be served from the in-process cache (documented
   * limitation: per-instance, resets on restart/deploy — acceptable since
   * this is display-only and every sensitive action calls
   * `verifyCurrentGuildManager` instead, which is never cached).
   */
  public async listManageableGuilds(userId: bigint): Promise<ManageableGuild[]> {
    const cacheKey = userId.toString();
    const cached = this.readCache.get(cacheKey);
    if (cached && Date.now() - cached.checkedAt < this.readCacheTtlMs) {
      return cached.guilds;
    }
    const guilds = await this.fetchManageableGuildsLive(userId);
    this.readCache.set(cacheKey, { guilds, checkedAt: Date.now() });
    return guilds;
  }

  /** Always live. Never served from `listManageableGuilds`'s cache. */
  public async verifyCurrentGuildManager(userId: bigint, discordGuildId: bigint): Promise<boolean> {
    const guilds = await this.fetchManageableGuildsLive(userId);
    return guilds.some((guild) => guild.id === discordGuildId);
  }

  private async fetchManageableGuildsLive(userId: bigint): Promise<ManageableGuild[]> {
    const accessToken = await this.getValidAccessToken(userId);

    let response: Response;
    try {
      response = await this.fetchFn(`${this.apiBaseUrl}/users/@me/guilds`, {
        headers: { authorization: `Bearer ${accessToken}` },
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch {
      throw new DiscordUnavailableError();
    }

    if (!response.ok) {
      throw new DiscordUnavailableError(
        `Discord guild list request failed with status ${response.status}`,
      );
    }

    const rows = (await response.json()) as DiscordGuildApiRow[];
    return rows
      .filter((row) => hasGuildManagePermission(row.permissions))
      .map((row) => ({ id: BigInt(row.id), name: row.name }));
  }

  private decryptStoredPayload(
    userId: bigint,
    credential: { ciphertext: Buffer; nonce: Buffer; authTag: Buffer; keyVersion: number },
  ): StoredOauthPayload {
    const plaintext = decryptDiscordOauthCredential(credential, { accountId: userId }, this.keys);
    return JSON.parse(plaintext) as StoredOauthPayload;
  }

  private async getValidAccessToken(userId: bigint): Promise<string> {
    const credential = await findDiscordOauthCredential(this.db, userId);
    if (!credential) {
      throw new DiscordUnavailableError("No linked Discord OAuth credential for this user");
    }

    const stored = this.decryptStoredPayload(userId, credential);
    const isFresh =
      credential.expiresAt !== null && credential.expiresAt.getTime() - REFRESH_SKEW_MS > Date.now();

    if (isFresh || !stored.refreshToken) {
      return stored.accessToken;
    }

    try {
      const refreshed = await this.refreshWithDiscord(stored.refreshToken);
      const nextRefreshToken = refreshed.refresh_token ?? stored.refreshToken;
      const encrypted = encryptDiscordOauthCredential(
        JSON.stringify({ accessToken: refreshed.access_token, refreshToken: nextRefreshToken }),
        { accountId: userId },
        this.keys,
      );
      const { ok } = await replaceDiscordOauthCredentialIfUnchanged(this.db, userId, credential.updatedAt, {
        accountId: userId,
        ciphertext: encrypted.ciphertext,
        nonce: encrypted.nonce,
        authTag: encrypted.authTag,
        keyVersion: encrypted.keyVersion,
        expiresAt: new Date(Date.now() + refreshed.expires_in * 1000),
      });
      if (ok) {
        return refreshed.access_token;
      }
      return await this.useWinningRefreshOrFail(userId, credential.updatedAt);
    } catch (error) {
      if (error instanceof DiscordUnavailableError) {
        throw error;
      }
      // Our own refresh attempt failed -- a concurrent request may have
      // already consumed the same (rotating) refresh token and won.
      return await this.useWinningRefreshOrFail(userId, credential.updatedAt);
    }
  }

  private async useWinningRefreshOrFail(userId: bigint, previousUpdatedAt: Date): Promise<string> {
    const latest = await findDiscordOauthCredential(this.db, userId);
    const wonByConcurrentRefresh =
      latest !== undefined &&
      latest.updatedAt.getTime() > previousUpdatedAt.getTime() &&
      latest.expiresAt !== null &&
      latest.expiresAt.getTime() > Date.now();

    if (!latest || !wonByConcurrentRefresh) {
      throw new DiscordUnavailableError("Unable to refresh Discord OAuth credential");
    }

    return this.decryptStoredPayload(userId, latest).accessToken;
  }

  private async refreshWithDiscord(refreshToken: string): Promise<DiscordRefreshResponse> {
    let response: Response;
    try {
      response = await this.fetchFn(this.tokenEndpoint, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          refresh_token: refreshToken,
          client_id: this.discordClientId,
          client_secret: this.discordClientSecret,
        }),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch {
      throw new DiscordUnavailableError();
    }

    if (!response.ok) {
      throw new DiscordUnavailableError(`Discord token refresh failed with status ${response.status}`);
    }

    return (await response.json()) as DiscordRefreshResponse;
  }
}
