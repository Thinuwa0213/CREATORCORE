import { afterEach, describe, expect, it } from "vitest";
import { createDatabaseClient, type DatabaseClient } from "./client.js";

const FAKE_CONFIG = {
  DB_HOST: "127.0.0.1",
  DB_PORT: 3306,
  DB_NAME: "creatorcore_test",
  DB_USER: "creatorcore",
  DB_PASSWORD: "unused-in-this-test",
  DB_CONNECTION_LIMIT: 1,
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
