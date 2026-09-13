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
 *
 * WORKER_TOKEN_SIGNING_KEY (docs/adr/0011, added Phase 3) is a field on
 * apiConfigSchema itself, not a separate schema needing its own subpath
 * split — it automatically inherits this exact same protection. The
 * dedicated assertion below names it explicitly anyway, rather than relying
 * only on the transitive "apiConfigSchema isn't exported at all" guarantee,
 * so a regression here fails with a message naming the actual secret.
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

  it("provides no path to WORKER_TOKEN_SIGNING_KEY (docs/adr/0011) — apiConfigSchema itself is unreachable here", () => {
    expect(bareEntry).not.toHaveProperty("apiConfigSchema");
    expect(bareEntry).not.toHaveProperty("loadApiConfig");
    expect(Object.keys(bareEntry).join(",")).not.toMatch(/WORKER_TOKEN_SIGNING_KEY/);
  });
});
