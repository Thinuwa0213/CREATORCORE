import { describe, expect, it } from "vitest";
import { loadWebConfig, webConfigSchema } from "./web.js";

describe("loadWebConfig", () => {
  it("accepts an empty environment by applying defaults", () => {
    const config = loadWebConfig({});
    expect(config.NODE_ENV).toBe("development");
    expect(config.NEXT_PUBLIC_APP_NAME).toBe("CreatorCore");
  });

  it("accepts an overridden public app name", () => {
    const config = loadWebConfig({ NEXT_PUBLIC_APP_NAME: "CreatorCore Staging" });
    expect(config.NEXT_PUBLIC_APP_NAME).toBe("CreatorCore Staging");
  });

  it("rejects an invalid NODE_ENV", () => {
    expect(() => loadWebConfig({ NODE_ENV: "nonsense" })).toThrow();
  });

  it("contains no server-secret-shaped field names", () => {
    const fieldNames = Object.keys(webConfigSchema.shape);
    const secretLike = /token|password|secret|key|credential/i;
    for (const name of fieldNames) {
      expect(name).not.toMatch(secretLike);
    }
  });

  it("cannot reach DATABASE_URL through the browser-safe config API", () => {
    const fieldNames = Object.keys(webConfigSchema.shape);
    expect(fieldNames).not.toContain("DATABASE_URL");

    const config = loadWebConfig({ DATABASE_URL: "mysql://creatorcore:leak@127.0.0.1:3306/db" });
    expect(config).not.toHaveProperty("DATABASE_URL");
  });
});
