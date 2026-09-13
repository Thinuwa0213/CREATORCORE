import { z } from "zod";
import { loadConfig } from "./env.js";
import { databaseConfigSchema } from "./database.js";

/**
 * apps/api is the only workspace that composes the database schema into its
 * own config, per docs/adr/0002 — it is the sole authorized holder of
 * database credentials.
 *
 * WORKER_TOKEN_SIGNING_KEY (docs/adr/0011) is the HMAC key apps/api uses to
 * sign/verify short-lived worker access tokens — it never leaves apps/api;
 * the worker receives only the issued token, never this key. It gets the
 * exact same isolation as DATABASE_URL for free: apiConfigSchema is
 * reachable only via the /api subpath, never the bare package entry point
 * (see index.ts) — no separate re-export rule is needed per field.
 * WORKER_TOKEN_SIGNING_KEY_VERSION/_PREVIOUS support signing-key rotation
 * with a cutover window (see apps/api/src/lib/worker-token.ts): tokens are
 * always issued under the current key, tagged with the current version;
 * verification also accepts the previous key for tokens issued just before
 * a rotation, until they naturally expire.
 */
function isValidBase64Url32(val: string): boolean {
  if (!/^[A-Za-z0-9_-]{43}$/.test(val)) {
    return false;
  }
  const buf = Buffer.from(val, "base64url");
  return buf.length === 32 && buf.toString("base64url") === val;
}

export const apiConfigSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "staging", "production"]).default("development"),
    LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
    PORT: z.coerce.number().int().positive().default(8787),
    WORKER_TOKEN_SIGNING_KEY: z.string().min(32, "WORKER_TOKEN_SIGNING_KEY must be at least 32 characters"),
    WORKER_TOKEN_SIGNING_KEY_VERSION: z.coerce.number().int().positive().default(1),
    WORKER_TOKEN_SIGNING_KEY_PREVIOUS: z.string().min(32).optional(),
    BOT_CREDENTIAL_ENCRYPTION_KEY: z.string({
      message: "BOT_CREDENTIAL_ENCRYPTION_KEY is required",
    }),
    BOT_CREDENTIAL_ENCRYPTION_KEY_VERSION: z.coerce.number().int().positive().default(1),
    BOT_CREDENTIAL_ENCRYPTION_KEY_PREVIOUS: z.string().optional(),
    BOT_CREDENTIAL_ENCRYPTION_KEY_PREVIOUS_VERSION: z.coerce.number().int().positive().optional(),
    // Phase 5 — Better Auth + Discord OAuth (docs/adr/0003). Better Auth runs
    // inside apps/api only; none of these reach apps/web or apps/worker.
    BETTER_AUTH_SECRET: z.string().min(32, "BETTER_AUTH_SECRET must be at least 32 characters"),
    // WEB_APP_ORIGIN serves double duty: it is Better Auth's baseURL (so the
    // Discord redirect_uri and session cookie are bound to the public
    // web-facing origin, never apps/api's own internal address — see the
    // ADR addendum), and the sole allowlisted origin the CSRF
    // origin-check middleware accepts on state-changing routes. A single
    // source of truth here avoids the two drifting apart.
    WEB_APP_ORIGIN: z.url({ message: "WEB_APP_ORIGIN must be a valid absolute URL" }),
    DISCORD_CLIENT_ID: z.string({ message: "DISCORD_CLIENT_ID is required" }).min(1),
    DISCORD_CLIENT_SECRET: z.string({ message: "DISCORD_CLIENT_SECRET is required" }).min(1),
    // Encrypts Discord user OAuth access/refresh tokens captured via the
    // account.create.before database hook (see apps/api/src/auth). Amendment
    // 1: deliberately a separate key domain from BOT_CREDENTIAL_ENCRYPTION_KEY
    // — a compromise of one must not compromise the other.
    DISCORD_OAUTH_TOKEN_ENCRYPTION_KEY: z.string({
      message: "DISCORD_OAUTH_TOKEN_ENCRYPTION_KEY is required",
    }),
    DISCORD_OAUTH_TOKEN_ENCRYPTION_KEY_VERSION: z.coerce.number().int().positive().default(1),
    DISCORD_OAUTH_TOKEN_ENCRYPTION_KEY_PREVIOUS: z.string().optional(),
    DISCORD_OAUTH_TOKEN_ENCRYPTION_KEY_PREVIOUS_VERSION: z.coerce.number().int().positive().optional(),
  })
  .extend(databaseConfigSchema.shape)
  .superRefine((data, ctx) => {
    // Validate current encryption key is strict base64url-encoded 32 bytes (Amendment 5)
    if (!isValidBase64Url32(data.BOT_CREDENTIAL_ENCRYPTION_KEY)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "BOT_CREDENTIAL_ENCRYPTION_KEY must be a canonical base64url-encoded 32-byte key",
        path: ["BOT_CREDENTIAL_ENCRYPTION_KEY"],
      });
    }

    // Previous key and version must either both exist or both be absent
    const hasPrevKey =
      data.BOT_CREDENTIAL_ENCRYPTION_KEY_PREVIOUS !== undefined &&
      data.BOT_CREDENTIAL_ENCRYPTION_KEY_PREVIOUS !== "";
    const hasPrevVer = data.BOT_CREDENTIAL_ENCRYPTION_KEY_PREVIOUS_VERSION !== undefined;

    if (hasPrevKey !== hasPrevVer) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "BOT_CREDENTIAL_ENCRYPTION_KEY_PREVIOUS and BOT_CREDENTIAL_ENCRYPTION_KEY_PREVIOUS_VERSION must both be present or both absent",
        path: ["BOT_CREDENTIAL_ENCRYPTION_KEY_PREVIOUS"],
      });
    }

    if (hasPrevKey && data.BOT_CREDENTIAL_ENCRYPTION_KEY_PREVIOUS) {
      if (!isValidBase64Url32(data.BOT_CREDENTIAL_ENCRYPTION_KEY_PREVIOUS)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            "BOT_CREDENTIAL_ENCRYPTION_KEY_PREVIOUS must be a canonical base64url-encoded 32-byte key",
          path: ["BOT_CREDENTIAL_ENCRYPTION_KEY_PREVIOUS"],
        });
      }

      if (
        data.BOT_CREDENTIAL_ENCRYPTION_KEY_PREVIOUS_VERSION ===
        data.BOT_CREDENTIAL_ENCRYPTION_KEY_VERSION
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            "BOT_CREDENTIAL_ENCRYPTION_KEY_PREVIOUS_VERSION must differ from BOT_CREDENTIAL_ENCRYPTION_KEY_VERSION",
          path: ["BOT_CREDENTIAL_ENCRYPTION_KEY_PREVIOUS_VERSION"],
        });
      }
    }

    // Credential encryption key material must differ from worker-token signing key material
    if (data.BOT_CREDENTIAL_ENCRYPTION_KEY === data.WORKER_TOKEN_SIGNING_KEY) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "BOT_CREDENTIAL_ENCRYPTION_KEY must differ from WORKER_TOKEN_SIGNING_KEY",
        path: ["BOT_CREDENTIAL_ENCRYPTION_KEY"],
      });
    }

    // Amendment 1: DISCORD_OAUTH_TOKEN_ENCRYPTION_KEY must be a canonical
    // base64url 32-byte key, and its own rotation pair follows the exact
    // same shape as BOT_CREDENTIAL_ENCRYPTION_KEY's above.
    if (!isValidBase64Url32(data.DISCORD_OAUTH_TOKEN_ENCRYPTION_KEY)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "DISCORD_OAUTH_TOKEN_ENCRYPTION_KEY must be a canonical base64url-encoded 32-byte key",
        path: ["DISCORD_OAUTH_TOKEN_ENCRYPTION_KEY"],
      });
    }

    const hasDiscordPrevKey =
      data.DISCORD_OAUTH_TOKEN_ENCRYPTION_KEY_PREVIOUS !== undefined &&
      data.DISCORD_OAUTH_TOKEN_ENCRYPTION_KEY_PREVIOUS !== "";
    const hasDiscordPrevVer = data.DISCORD_OAUTH_TOKEN_ENCRYPTION_KEY_PREVIOUS_VERSION !== undefined;

    if (hasDiscordPrevKey !== hasDiscordPrevVer) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "DISCORD_OAUTH_TOKEN_ENCRYPTION_KEY_PREVIOUS and DISCORD_OAUTH_TOKEN_ENCRYPTION_KEY_PREVIOUS_VERSION must both be present or both absent",
        path: ["DISCORD_OAUTH_TOKEN_ENCRYPTION_KEY_PREVIOUS"],
      });
    }

    if (hasDiscordPrevKey && data.DISCORD_OAUTH_TOKEN_ENCRYPTION_KEY_PREVIOUS) {
      if (!isValidBase64Url32(data.DISCORD_OAUTH_TOKEN_ENCRYPTION_KEY_PREVIOUS)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            "DISCORD_OAUTH_TOKEN_ENCRYPTION_KEY_PREVIOUS must be a canonical base64url-encoded 32-byte key",
          path: ["DISCORD_OAUTH_TOKEN_ENCRYPTION_KEY_PREVIOUS"],
        });
      }

      if (
        data.DISCORD_OAUTH_TOKEN_ENCRYPTION_KEY_PREVIOUS_VERSION ===
        data.DISCORD_OAUTH_TOKEN_ENCRYPTION_KEY_VERSION
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            "DISCORD_OAUTH_TOKEN_ENCRYPTION_KEY_PREVIOUS_VERSION must differ from DISCORD_OAUTH_TOKEN_ENCRYPTION_KEY_VERSION",
          path: ["DISCORD_OAUTH_TOKEN_ENCRYPTION_KEY_PREVIOUS_VERSION"],
        });
      }
    }

    // Amendment 1: the OAuth-token key domain must be independent of every
    // other secret in this schema — a compromise of one must never imply
    // the others. Checked pairwise against each sibling secret, including
    // both domains' rotation-pair PREVIOUS slots (a rotation cutover is
    // exactly the moment two normally-independent values are both "live"
    // at once, so the previous slots need the same distinctness guarantee
    // as the current ones — checked at every value on both sides, not just
    // the two "current" values).
    const discordKeyDomainValues: [string, string | undefined][] = [
      ["DISCORD_OAUTH_TOKEN_ENCRYPTION_KEY", data.DISCORD_OAUTH_TOKEN_ENCRYPTION_KEY],
      ["DISCORD_OAUTH_TOKEN_ENCRYPTION_KEY_PREVIOUS", data.DISCORD_OAUTH_TOKEN_ENCRYPTION_KEY_PREVIOUS],
    ];
    const otherSecretDomainValues: [string, string | undefined][] = [
      ["BOT_CREDENTIAL_ENCRYPTION_KEY", data.BOT_CREDENTIAL_ENCRYPTION_KEY],
      ["BOT_CREDENTIAL_ENCRYPTION_KEY_PREVIOUS", data.BOT_CREDENTIAL_ENCRYPTION_KEY_PREVIOUS],
      ["WORKER_TOKEN_SIGNING_KEY", data.WORKER_TOKEN_SIGNING_KEY],
      ["WORKER_TOKEN_SIGNING_KEY_PREVIOUS", data.WORKER_TOKEN_SIGNING_KEY_PREVIOUS],
      ["BETTER_AUTH_SECRET", data.BETTER_AUTH_SECRET],
      ["DISCORD_CLIENT_SECRET", data.DISCORD_CLIENT_SECRET],
    ];
    for (const [discordFieldName, discordValue] of discordKeyDomainValues) {
      if (discordValue === undefined || discordValue === "") {
        continue;
      }
      for (const [peerName, peerValue] of otherSecretDomainValues) {
        if (peerValue === undefined || peerValue === "") {
          continue;
        }
        if (discordValue === peerValue) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `${discordFieldName} must differ from ${peerName}`,
            path: [discordFieldName],
          });
        }
      }
    }
  });

export type ApiConfig = z.infer<typeof apiConfigSchema>;

export function loadApiConfig(source: Record<string, string | undefined> = process.env): ApiConfig {
  return loadConfig("apps/api", apiConfigSchema, source);
}

