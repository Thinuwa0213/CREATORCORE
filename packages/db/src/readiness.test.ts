import { describe, expect, it } from "vitest";
import { checkDatabaseConnectivity } from "./readiness.js";

describe("checkDatabaseConnectivity", () => {
  it("returns true when the probe query succeeds", async () => {
    const fakePool = { query: async () => [[{ "1": 1 }], []] };
    await expect(checkDatabaseConnectivity(fakePool)).resolves.toBe(true);
  });

  it("returns false, never throws, when the probe query fails", async () => {
    const fakePool = {
      query: async () => {
        throw new Error("ECONNREFUSED");
      },
    };
    await expect(checkDatabaseConnectivity(fakePool)).resolves.toBe(false);
  });
});
