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
  });

export type ApiConfig = z.infer<typeof apiConfigSchema>;

export function loadApiConfig(source: Record<string, string | undefined> = process.env): ApiConfig {
  return loadConfig("apps/api", apiConfigSchema, source);
}

