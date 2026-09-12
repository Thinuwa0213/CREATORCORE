import { afterEach, describe, expect, it } from "vitest";
import { createDatabaseClient, type DatabaseClient } from "./client.js";

const FAKE_CONFIG = {
  DATABASE_URL: "mysql://creatorcore:unused-in-this-test@127.0.0.1:3306/creatorcore_test",
};

describe("createDatabaseClient", () => {
  let client: DatabaseClient | undefined;

  afterEach(async () => {
    await client?.close();
    client = undefined;
  });

  it("creates a pool + Drizzle instance without connecting (mysql2 pools are lazy)", () => {
    client = createDatabaseClient(FAKE_CONFIG);

    expect(client.pool).toBeDefined();
    expect(client.db).toBeDefined();
    expect(typeof client.close).toBe("function");
  });

  it("closes cleanly even though no query was ever issued", async () => {
    client = createDatabaseClient(FAKE_CONFIG);
    await expect(client.close()).resolves.toBeUndefined();
  });
});
