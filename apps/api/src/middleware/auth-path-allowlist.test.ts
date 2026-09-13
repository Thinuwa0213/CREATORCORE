import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import {
  createAuthPathAllowlistMiddleware,
  isAllowedBetterAuthPath,
} from "./auth-path-allowlist.js";

const MOUNT_PATH = "/api/auth";

function buildApp() {
  const app = new Hono();
  app.on(["GET", "POST"], `${MOUNT_PATH}/*`, createAuthPathAllowlistMiddleware(MOUNT_PATH), (c) =>
    c.json({ ok: true }),
  );
  return app;
}

describe("auth path allowlist (security-review H1 — defense in depth over disabledPaths)", () => {
  const ALLOWED = [
    "/sign-in/social",
    "/sign-out",
    "/get-session",
    "/list-sessions",
    "/revoke-session",
    "/revoke-sessions",
    "/revoke-other-sessions",
    "/ok",
    "/error",
    "/callback/discord",
  ];

  // The six endpoints proven (Phase 5 design doc's Step 0) to read/write
  // account.accessToken/refreshToken as live plaintext, plus the whole
  // email/password surface this app never uses.
  const BLOCKED = [
    "/get-access-token",
    "/refresh-token",
    "/account-info",
    "/link-social",
    "/unlink-account",
    "/list-accounts",
    "/sign-in/email",
    "/sign-up/email",
    "/change-password",
    "/reset-password",
    "/request-password-reset",
    "/verify-password",
    "/send-verification-email",
    "/verify-email",
    "/update-user",
    "/change-email",
    "/delete-user",
    "/some-future-endpoint-nobody-has-heard-of-yet",
  ];

  for (const subPath of ALLOWED) {
    it(`allows ${subPath} through`, async () => {
      const app = buildApp();
      const res = await app.request(`${MOUNT_PATH}${subPath}`, { method: "GET" });
      expect(res.status).toBe(200);
    });
  }

  for (const subPath of BLOCKED) {
    it(`blocks ${subPath} with 404 before any handler runs`, async () => {
      const app = buildApp();
      const res = await app.request(`${MOUNT_PATH}${subPath}`, { method: "GET" });
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: "not_found" });
    });
  }

  it("isAllowedBetterAuthPath fails closed for an unrecognized path", () => {
    expect(isAllowedBetterAuthPath("/anything-not-on-the-list")).toBe(false);
  });
});
