import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { createOriginCheckMiddleware } from "./origin-check.js";

const ALLOWED_ORIGIN = "https://app.creatorcore.test";

function buildApp() {
  const app = new Hono();
  app.use("*", createOriginCheckMiddleware(ALLOWED_ORIGIN));
  app.get("/read", (c) => c.json({ ok: true }));
  app.post("/write", (c) => c.json({ ok: true }));
  app.put("/write", (c) => c.json({ ok: true }));
  app.patch("/write", (c) => c.json({ ok: true }));
  app.delete("/write", (c) => c.json({ ok: true }));
  return app;
}

describe("createOriginCheckMiddleware (CSRF, security-review H3/M4)", () => {
  it("allows GET requests through regardless of Origin", async () => {
    const app = buildApp();
    const res = await app.request("/read", { method: "GET" });
    expect(res.status).toBe(200);
  });

  it("allows a state-changing request with the exact matching Origin", async () => {
    const app = buildApp();
    const res = await app.request("/write", {
      method: "POST",
      headers: { origin: ALLOWED_ORIGIN },
    });
    expect(res.status).toBe(200);
  });

  for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
    it(`rejects a ${method} request with a missing Origin header (fail closed)`, async () => {
      const app = buildApp();
      const res = await app.request("/write", { method });
      expect(res.status).toBe(403);
      expect(await res.json()).toEqual({ error: "CSRF_ORIGIN_MISMATCH" });
    });

    it(`rejects a ${method} request with a forged/foreign Origin header`, async () => {
      const app = buildApp();
      const res = await app.request("/write", {
        method,
        headers: { origin: "https://attacker.example" },
      });
      expect(res.status).toBe(403);
    });
  }

  it("rejects a subdomain or trailing-slash variant of the allowed origin (exact match only)", async () => {
    const app = buildApp();
    const res = await app.request("/write", {
      method: "POST",
      headers: { origin: "https://evil.app.creatorcore.test" },
    });
    expect(res.status).toBe(403);
  });
});
