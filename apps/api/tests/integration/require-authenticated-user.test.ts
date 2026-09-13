import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Hono } from "hono";
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
  createUser,
  type DatabaseClient,
} from "@creatorcore/db";
import {
  createRequireAuthenticatedUser,
  type AuthenticatedUserEnv,
} from "../../src/middleware/require-authenticated-user.js";
import type { Auth } from "../../src/auth/index.js";

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
  console.warn(
    "[apps/api] require-authenticated-user integration test SKIPPED — no reachable database.",
  );
}

/**
 * A fake `Auth` exposing only the one method this middleware calls
 * (`auth.api.getSession`). Better Auth's own cookie-signing/session-store
 * format is Better Auth's own already-tested concern (see the Phase 5
 * design doc) — the Playwright E2E suite exercises the real cookie
 * end-to-end; this test verifies THIS middleware's own contract: what it
 * does with whatever `getSession` resolves to, against a real database for
 * the Discord-account-id bridge lookup (architecture-review MEDIUM-6).
 */
function fakeAuth(sessionResult: { user: { id: string } } | null): Auth {
  return {
    api: {
      getSession: async () => sessionResult,
    },
  } as unknown as Auth;
}

describe.skipIf(!dbAvailable)("createRequireAuthenticatedUser (real MySQL)", () => {
  let dbClient: DatabaseClient;
  const KNOWN_BETTER_AUTH_USER_ID = "better-auth-user-req-auth-test";
  const DISCORD_ACCOUNT_ID = BigInt(Date.now()) * 1000n + 42n;

  beforeAll(async () => {
    dbClient = createDatabaseClient(loadDatabaseConfig());
    await createUser(dbClient.db, DISCORD_ACCOUNT_ID, "Test User");
    await dbClient.pool.query(
      "INSERT INTO auth_users (id, email, email_verified, name) VALUES (?, ?, false, ?)",
      [
        KNOWN_BETTER_AUTH_USER_ID,
        `discord-${DISCORD_ACCOUNT_ID}@users.creatorcore.internal`,
        "Test User",
      ],
    );
    await dbClient.pool.query(
      "INSERT INTO auth_accounts (id, user_id, provider_id, account_id) VALUES (?, ?, 'discord', ?)",
      [
        `account-${KNOWN_BETTER_AUTH_USER_ID}`,
        KNOWN_BETTER_AUTH_USER_ID,
        DISCORD_ACCOUNT_ID.toString(),
      ],
    );
  });

  afterAll(async () => {
    await dbClient.pool.query("DELETE FROM auth_accounts WHERE user_id = ?", [
      KNOWN_BETTER_AUTH_USER_ID,
    ]);
    await dbClient.pool.query("DELETE FROM auth_users WHERE id = ?", [KNOWN_BETTER_AUTH_USER_ID]);
    await dbClient.pool.query("DELETE FROM users WHERE id = ?", [DISCORD_ACCOUNT_ID]);
    await dbClient.close();
  });

  function buildApp(auth: Auth) {
    const app = new Hono<AuthenticatedUserEnv>();
    app.use("*", createRequireAuthenticatedUser({ auth, db: dbClient.db }));
    app.get("/whoami", (c) => c.json({ userId: c.get("userId").toString() }));
    return app;
  }

  it("rejects with 401 when there is no session", async () => {
    const app = buildApp(fakeAuth(null));
    const res = await app.request("/whoami");
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "AUTH_REQUIRED" });
  });

  it("rejects with 401 when the session's Better Auth user has no linked Discord account", async () => {
    const app = buildApp(fakeAuth({ user: { id: "no-such-better-auth-user" } }));
    const res = await app.request("/whoami");
    expect(res.status).toBe(401);
  });

  it("resolves the CreatorCore userId (Discord snowflake) for a valid session, never trusting a client-supplied id", async () => {
    const app = buildApp(fakeAuth({ user: { id: KNOWN_BETTER_AUTH_USER_ID } }));
    // A forged userId header must have no effect -- the middleware never
    // reads one.
    const res = await app.request("/whoami", {
      headers: { "x-user-id": "999999999999999999" },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ userId: DISCORD_ACCOUNT_ID.toString() });
  });
});
