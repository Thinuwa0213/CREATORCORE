import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { loadDatabaseConfig } from "@creatorcore/config/database";
import { createDatabaseClient, checkDatabaseConnectivity } from "@creatorcore/db";
import { createLogger } from "@creatorcore/logger";
import { createApp } from "../../src/app.js";

if (!process.env.DATABASE_URL && typeof process.loadEnvFile === "function") {
  const envPath = path.resolve(fileURLToPath(import.meta.url), "../../../../../.env");
  if (fs.existsSync(envPath)) {
    process.loadEnvFile(envPath);
  }
}

/**
 * Real MySQL 8.x integration test for /ready (docs/DATABASE_RULES.md — no
 * SQLite substitution). Skips visibly (not a faked pass) when no database
 * is reachable — see packages/db/tests/integration/connectivity.test.ts for
 * the same pattern.
 */
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
    "[apps/api] /ready integration test SKIPPED — no reachable database. " +
      "CONFIGURED BUT NOT VERIFIED, not a pass.",
  );
}

describe.skipIf(!dbAvailable)("GET /ready against a real database", () => {
  it("reports ready:true through the full app + db client path", async () => {
    const client = createDatabaseClient(loadDatabaseConfig());
    const app = createApp({
      logger: createLogger({ service: "apps/api-integration-test", write: () => undefined }),
      db: client.db,
      signingKeys: { current: "integration-test-only-signing-key-not-a-real-secret", currentVersion: 1 },
      checkDatabaseReady: () => checkDatabaseConnectivity(client.pool),
    });

    const res = await app.request("/ready");

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ready", database: true });

    await client.close();
  });
});
