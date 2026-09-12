import { describe, expect, it } from "vitest";
import * as bareEntry from "./index.js";

/**
 * apiConfigSchema/loadApiConfig `.extend()` databaseConfigSchema's shape, so
 * they carry DATABASE_URL. Re-exporting either from the bare package entry
 * would let apps/web/apps/worker reach it through a dependency they already
 * legitimately hold (found during the DATABASE_URL security review) — the
 * same class of leak the pre-existing @creatorcore/config/database subpath
 * split was built to prevent. This test locks the boundary at runtime, not
 * just via package.json#exports, so a regression fails loudly here too.
 */
describe("@creatorcore/config bare entry point", () => {
  it("does not export loadApiConfig or apiConfigSchema", () => {
    expect(bareEntry).not.toHaveProperty("loadApiConfig");
    expect(bareEntry).not.toHaveProperty("apiConfigSchema");
  });

  it("does not export loadDatabaseConfig or databaseConfigSchema", () => {
    expect(bareEntry).not.toHaveProperty("loadDatabaseConfig");
    expect(bareEntry).not.toHaveProperty("databaseConfigSchema");
  });
});
