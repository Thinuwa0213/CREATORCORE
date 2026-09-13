import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadDatabaseConfig } from "@creatorcore/config/database";

if (!process.env.DATABASE_URL && typeof process.loadEnvFile === "function") {
  const envPath = path.resolve(fileURLToPath(import.meta.url), "../../../../../.env");
  if (fs.existsSync(envPath)) {
    process.loadEnvFile(envPath);
  }
}
import {
  checkDatabaseConnectivity,
  createDatabaseClient,
  findUserById,
  type DatabaseClient,
} from "@creatorcore/db";
import { createLogger } from "@creatorcore/logger";
import { createAuth } from "../../src/auth/index.js";
import {
  decryptDiscordOauthCredential,
  type DiscordOauthTokenEncryptionKeys,
} from "../../src/lib/credential-crypto.js";

async function probeDatabase(): Promise<boolean> {
  try {
    const client = createDatabaseClient(loadDatabaseConfig());
    const ok = await checkDatabaseConnectivity(client.pool);
    await client.close();
    return ok;
  } catch {
    return false;
  }
}

const dbAvailable = await probeDatabase();
if (!dbAvailable) {
  console.warn("[apps/api] discord-oauth-hooks integration test SKIPPED — no reachable database.");
}

function testSnowflake(): bigint {
  // A realistic-looking Discord snowflake, unique per test run.
  return BigInt(Date.now()) * 1000n + BigInt(Math.floor(Math.random() * 999));
}

/**
 * Real-MySQL proof (Amendment 2) that Better Auth's own `account` table
 * never holds Discord OAuth token material, and that the encrypted copy in
 * `discord_oauth_credentials` round-trips correctly — exercised through
 * Better Auth's REAL internal adapter (`ctx.internalAdapter.createOAuthUser`/
 * `updateAccount`), the exact functions proven in the Phase 5 design doc's
 * Step 0 to be what Better Auth's own OAuth callback and refresh endpoints
 * call — not a mock of the hook mechanism.
 */
describe.skipIf(!dbAvailable)("Discord OAuth account.create/update hooks (real MySQL)", () => {
  let dbClient: DatabaseClient;
  const OAUTH_KEYS: DiscordOauthTokenEncryptionKeys = {
    keyDomain: "discord_oauth_token",
    current: randomBytes(32),
    currentVersion: 1,
  };
  let auth: ReturnType<typeof createAuth>;

  beforeAll(() => {
    dbClient = createDatabaseClient(loadDatabaseConfig());
    const logger = createLogger({
      service: "api-oauth-hooks-test",
      write: (chunk) => console.log(chunk),
    });

    auth = createAuth({
      db: dbClient.db,
      logger,
      webAppOrigin: "https://app.creatorcore.test",
      betterAuthSecret: "a".repeat(32),
      discordClientId: "test-discord-client-id",
      discordClientSecret: "test-discord-client-secret",
      discordOauthTokenKeys: OAUTH_KEYS,
    });
  });

  afterAll(async () => {
    await dbClient.close();
  });

  it("first-ever sign-in encrypts tokens into discord_oauth_credentials and blanks Better Auth's own account row", async () => {
    const accountId = testSnowflake();
    const PLAINTEXT_ACCESS = "discord-access-token-do-not-persist";
    const PLAINTEXT_REFRESH = "discord-refresh-token-do-not-persist";

    const ctx = await auth.$context;
    const result = await ctx.internalAdapter.createOAuthUser(
      {
        email: `discord-${accountId}@users.creatorcore.internal`,
        emailVerified: false,
        name: "Test User",
      },
      {
        providerId: "discord",
        accountId: accountId.toString(),
        accessToken: PLAINTEXT_ACCESS,
        refreshToken: PLAINTEXT_REFRESH,
      },
    );

    expect(result).toBeTruthy();
    const createdAccountId = (result as { account: { id: string } }).account.id;

    // 1. Better Auth's own account row: token columns NULL, no raw token
    //    substring anywhere in the row (defense in depth beyond the
    //    column-is-null check).
    const [accountRows] = await dbClient.pool.query(
      "SELECT access_token, refresh_token, id_token FROM auth_accounts WHERE id = ?",
      [createdAccountId],
    );
    const accountRow = (accountRows as Record<string, unknown>[])[0];
    expect(accountRow?.access_token).toBeNull();
    expect(accountRow?.refresh_token).toBeNull();
    expect(accountRow?.id_token).toBeNull();
    expect(JSON.stringify(accountRow)).not.toContain(PLAINTEXT_ACCESS);
    expect(JSON.stringify(accountRow)).not.toContain(PLAINTEXT_REFRESH);

    // 2. discord_oauth_credentials holds the real, encrypted material.
    const [credRows] = await dbClient.pool.query(
      "SELECT ciphertext, nonce, auth_tag, key_version FROM discord_oauth_credentials WHERE account_id = ?",
      [accountId],
    );
    const credRow = (credRows as Record<string, unknown>[])[0];
    expect(credRow).toBeTruthy();
    const ciphertext = credRow?.ciphertext as Buffer;
    expect(ciphertext).toBeInstanceOf(Buffer);
    expect(ciphertext.includes(PLAINTEXT_ACCESS)).toBe(false);
    expect(ciphertext.includes(PLAINTEXT_REFRESH)).toBe(false);

    const decrypted = decryptDiscordOauthCredential(
      {
        ciphertext,
        nonce: credRow?.nonce as Buffer,
        authTag: credRow?.auth_tag as Buffer,
        keyVersion: Number(credRow?.key_version),
      },
      { accountId },
      OAUTH_KEYS,
    );
    expect(JSON.parse(decrypted)).toEqual({
      accessToken: PLAINTEXT_ACCESS,
      refreshToken: PLAINTEXT_REFRESH,
    });

    // 3. CreatorCore's own users row was synced (create.after).
    const creatorCoreUser = await findUserById(dbClient.db, accountId);
    expect(creatorCoreUser).toBeTruthy();
    expect(creatorCoreUser?.id).toBe(accountId);

    await dbClient.pool.query("DELETE FROM discord_oauth_credentials WHERE account_id = ?", [
      accountId,
    ]);
    await dbClient.pool.query("DELETE FROM users WHERE id = ?", [accountId]);
    await dbClient.pool.query("DELETE FROM auth_accounts WHERE id = ?", [createdAccountId]);
    await dbClient.pool.query("DELETE FROM auth_users WHERE id = ?", [
      (result as { user: { id: string } }).user.id,
    ]);
  });

  it("an update-shaped write (repeat sign-in / native refresh endpoints) blanks tokens and never overwrites the stored credential", async () => {
    const accountId = testSnowflake();
    const ORIGINAL_ACCESS = "original-access-token";
    const ORIGINAL_REFRESH = "original-refresh-token";

    const ctx = await auth.$context;
    const created = await ctx.internalAdapter.createOAuthUser(
      {
        email: `discord-${accountId}@users.creatorcore.internal`,
        emailVerified: false,
        name: "Test User 2",
      },
      {
        providerId: "discord",
        accountId: accountId.toString(),
        accessToken: ORIGINAL_ACCESS,
        refreshToken: ORIGINAL_REFRESH,
      },
    );
    const createdAccountId = (created as { account: { id: string } }).account.id;

    // Simulate exactly what callback.mjs's repeat-sign-in branch and
    // account.mjs's getValidAccessToken/refreshToken endpoints do: an
    // update-shaped write to the account row with fresh (would-be)
    // plaintext tokens and no accountId/userId in the delta.
    await ctx.internalAdapter.updateAccount(createdAccountId, {
      accessToken: "NEW-TOKEN-FROM-REFRESH-ATTEMPT",
      refreshToken: "NEW-REFRESH-FROM-REFRESH-ATTEMPT",
      accessTokenExpiresAt: new Date(Date.now() + 3600_000),
    });

    const [accountRows] = await dbClient.pool.query(
      "SELECT access_token, refresh_token FROM auth_accounts WHERE id = ?",
      [createdAccountId],
    );
    const accountRow = (accountRows as Record<string, unknown>[])[0];
    expect(accountRow?.access_token).toBeNull();
    expect(accountRow?.refresh_token).toBeNull();

    // The stored credential is untouched -- still decrypts to the
    // ORIGINAL tokens captured at create.before, not the update attempt's.
    const [credRows] = await dbClient.pool.query(
      "SELECT ciphertext, nonce, auth_tag, key_version FROM discord_oauth_credentials WHERE account_id = ?",
      [accountId],
    );
    const credRow = (credRows as Record<string, unknown>[])[0];
    const decrypted = decryptDiscordOauthCredential(
      {
        ciphertext: credRow?.ciphertext as Buffer,
        nonce: credRow?.nonce as Buffer,
        authTag: credRow?.auth_tag as Buffer,
        keyVersion: Number(credRow?.key_version),
      },
      { accountId },
      OAUTH_KEYS,
    );
    expect(JSON.parse(decrypted)).toEqual({
      accessToken: ORIGINAL_ACCESS,
      refreshToken: ORIGINAL_REFRESH,
    });

    await dbClient.pool.query("DELETE FROM discord_oauth_credentials WHERE account_id = ?", [
      accountId,
    ]);
    await dbClient.pool.query("DELETE FROM users WHERE id = ?", [accountId]);
    await dbClient.pool.query("DELETE FROM auth_accounts WHERE id = ?", [createdAccountId]);
    await dbClient.pool.query("DELETE FROM auth_users WHERE id = ?", [
      (created as { user: { id: string } }).user.id,
    ]);
  });
});
