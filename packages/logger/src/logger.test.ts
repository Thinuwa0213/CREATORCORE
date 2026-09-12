import { describe, expect, it } from "vitest";
import { createLogger } from "./logger.js";

function capture() {
  const lines: string[] = [];
  return { lines, write: (line: string) => lines.push(line) };
}

describe("createLogger", () => {
  it("emits structured JSON with timestamp, level, service, message", () => {
    const { lines, write } = capture();
    const logger = createLogger({ service: "apps/api", write });

    logger.info("ready");

    expect(lines).toHaveLength(1);
    const parsed = JSON.parse(lines[0] ?? "{}");
    expect(parsed.level).toBe("info");
    expect(parsed.service).toBe("apps/api");
    expect(parsed.message).toBe("ready");
    expect(typeof parsed.timestamp).toBe("string");
  });

  it("redacts sensitive context fields before serialization", () => {
    const { lines, write } = capture();
    const logger = createLogger({ service: "apps/worker", write });

    logger.error("connection failed", { botToken: "super-secret-token" });

    const parsed = JSON.parse(lines[0] ?? "{}");
    expect(parsed.botToken).toBe("[REDACTED]");
    expect(JSON.stringify(parsed)).not.toContain("super-secret-token");
  });

  it("never logs a complete config/env object without redaction", () => {
    const { lines, write } = capture();
    const logger = createLogger({ service: "apps/api", write });

    logger.info("config loaded", {
      NODE_ENV: "test",
      DB_PASSWORD: "do-not-leak",
      correlationId: "req-1",
    });

    const serialized = lines[0] ?? "";
    expect(serialized).not.toContain("do-not-leak");
    expect(serialized).toContain("req-1");
  });

  it("suppresses levels below the configured minimum", () => {
    const { lines, write } = capture();
    const logger = createLogger({ service: "apps/worker", level: "warn", write });

    logger.debug("noisy");
    logger.info("also noisy");
    logger.warn("audible");

    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0] ?? "{}").message).toBe("audible");
  });
});
