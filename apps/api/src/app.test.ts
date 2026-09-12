import { describe, expect, it, vi } from "vitest";
import { createLogger } from "@creatorcore/logger";
import { createApp } from "./app.js";

function testLogger() {
  return createLogger({ service: "apps/api-test", write: () => undefined });
}

describe("GET /health", () => {
  it("returns ok without checking the database", async () => {
    const checkDatabaseReady = vi.fn();
    const app = createApp({ logger: testLogger(), checkDatabaseReady });

    const res = await app.request("/health");

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok" });
    expect(checkDatabaseReady).not.toHaveBeenCalled();
  });
});

describe("GET /ready", () => {
  it("returns 200 and ready:true when the database is reachable", async () => {
    const app = createApp({
      logger: testLogger(),
      checkDatabaseReady: async () => true,
    });

    const res = await app.request("/ready");

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ready", database: true });
  });

  it("returns 503 and ready:false when the database is unreachable, with no leaked details", async () => {
    const app = createApp({
      logger: testLogger(),
      checkDatabaseReady: async () => false,
    });

    const res = await app.request("/ready");
    const body = await res.json();

    expect(res.status).toBe(503);
    expect(body).toEqual({ status: "not_ready", database: false });
    expect(JSON.stringify(body)).not.toMatch(/host|user|password|ECONNREFUSED/i);
  });
});

describe("error handling", () => {
  it("returns a generic 500 and never leaks the thrown error's message in the HTTP response", async () => {
    const app = createApp({
      logger: testLogger(),
      checkDatabaseReady: async () => {
        throw new Error("connection string: mysql://admin:leaked-secret@db-host/prod");
      },
    });

    const res = await app.request("/ready");
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body).toEqual({ error: "internal_server_error" });
    expect(JSON.stringify(body)).not.toContain("leaked-secret");
  });

  it("known limitation: the SAME thrown error's message is NOT scrubbed from the server-side log sink", () => {
    // This is the log-output side of the test above, checked separately on
    // purpose (test-reviewer flagged that the HTTP-response test alone could
    // be misread as covering "secrets never leak," when it only covers the
    // client-facing layer). packages/logger's redaction is key-based, not
    // content-based (packages/logger/src/redact.ts) — an Error's .message
    // is logged verbatim. The actual rule this test enforces is the one in
    // docs/SECURITY.md: never construct an Error whose message embeds a
    // secret value in the first place. If this assertion ever starts
    // failing (i.e. the secret stops appearing), update it — that would
    // mean redaction became content-aware, which would be a real
    // improvement, not a regression.
    const lines: string[] = [];
    const logger = createLogger({ service: "apps/api-test", write: (line) => lines.push(line) });
    logger.error("unhandled request error", {
      err: new Error("connection string: mysql://admin:leaked-secret@db-host/prod"),
    });

    expect(lines.join("")).toContain("leaked-secret");
  });
});

describe("unmatched routes", () => {
  it("returns a safe 404", async () => {
    const app = createApp({ logger: testLogger(), checkDatabaseReady: async () => true });

    const res = await app.request("/does-not-exist");

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "not_found" });
  });
});
