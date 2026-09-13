import { describe, expect, it } from "vitest";
import { loadWebServerConfig, webServerConfigSchema } from "./web-server.js";
import { ConfigValidationError } from "./errors.js";

describe("loadWebServerConfig", () => {
  it("requires API_INTERNAL_URL", () => {
    expect(() => loadWebServerConfig({})).toThrow(ConfigValidationError);
  });

  it("accepts a valid absolute URL", () => {
    const config = loadWebServerConfig({ API_INTERNAL_URL: "https://api.internal:8787" });
    expect(config.API_INTERNAL_URL).toBe("https://api.internal:8787");
  });

  it("rejects a value that is not an absolute URL", () => {
    expect(() => loadWebServerConfig({ API_INTERNAL_URL: "not-a-url" })).toThrow(
      ConfigValidationError,
    );
  });

  it("contains no NEXT_PUBLIC_-prefixed fields (never bundled to the browser)", () => {
    const fieldNames = Object.keys(webServerConfigSchema.shape);
    for (const name of fieldNames) {
      expect(name.startsWith("NEXT_PUBLIC_")).toBe(false);
    }
  });
});
