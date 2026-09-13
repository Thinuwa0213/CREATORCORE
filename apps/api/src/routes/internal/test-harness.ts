import { Hono } from "hono";
import { createHmac } from "node:crypto";
import { createTestUserSession, type DatabaseClient } from "@creatorcore/db";
import type { FakeDiscordGuildProvider } from "../../discord/fake-discord-guild-provider.js";

export interface TestHarnessDeps {
  db: DatabaseClient["db"];
  fakeDiscordGuildProvider?: FakeDiscordGuildProvider | undefined;
  betterAuthSecret?: string | undefined;
}

/**
 * Hard requirement (Amendment 1 & 4):
 * This test harness must exist ONLY when ALL three conditions are strictly met:
 * 1. NODE_ENV === "test"
 * 2. USE_FAKE_DISCORD === "true"
 * 3. ENABLE_E2E_TEST_HARNESS === "true"
 *
 * If any condition is false/omitted, this function returns false and the routes
 * are NOT mounted anywhere in the application router.
 */
export function isTestHarnessEnabled(): boolean {
  return (
    process.env.NODE_ENV === "test" &&
    process.env.USE_FAKE_DISCORD === "true" &&
    process.env.ENABLE_E2E_TEST_HARNESS === "true"
  );
}

export function createTestHarnessRoutes(deps: TestHarnessDeps): Hono {
  const router = new Hono();

  /**
   * Bootstraps a legitimate Better Auth user and database session in MySQL
   * for deterministic E2E testing without an external Discord OAuth round trip.
   *
   * Security constraints:
   * - No auth bypass: application endpoints still authenticate via auth.api.getSession()
   * - No trusted headers or browser-supplied user IDs in application routes
   * - Sets the real, cryptographically signed better-auth.session_token cookie
   */
  router.post("/session", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as {
      discordUserId?: string;
      name?: string;
    };

    const discordUserIdRaw = body.discordUserId;
    if (!discordUserIdRaw || !/^[0-9]{1,20}$/.test(discordUserIdRaw)) {
      return c.json({ error: "INVALID_DISCORD_USER_ID" }, 400);
    }

    const discordUserId = BigInt(discordUserIdRaw);
    const userName = body.name?.trim() || `E2E Test User ${discordUserIdRaw.slice(-4)}`;

    const { sessionToken, betterAuthUserId } = await createTestUserSession(
      deps.db,
      discordUserId,
      userName,
    );

    const secret = deps.betterAuthSecret || process.env.BETTER_AUTH_SECRET;
    let cookieValue = sessionToken;
    if (secret) {
      const hmac = createHmac("sha256", secret).update(sessionToken).digest("base64");
      cookieValue = encodeURIComponent(`${sessionToken}.${hmac}`);
    }

    // Set signed cookie
    c.header(
      "Set-Cookie",
      `better-auth.session_token=${cookieValue}; Path=/; HttpOnly; SameSite=Lax`,
    );

    return c.json({
      ok: true,
      discordUserId: discordUserIdRaw,
      betterAuthUserId,
      sessionToken,
      cookieName: "better-auth.session_token",
      cookieValue,
      cookie: `better-auth.session_token=${cookieValue}`,
    });
  });

  /**
   * Sets the manageable guilds fixture for a user in the fake Discord provider.
   */
  router.post("/discord/guilds", async (c) => {
    if (!deps.fakeDiscordGuildProvider) {
      return c.json({ error: "FAKE_DISCORD_PROVIDER_NOT_CONFIGURED" }, 500);
    }

    const body = (await c.req.json().catch(() => ({}))) as {
      discordUserId?: string;
      guilds?: { id: string; name: string }[];
    };

    const discordUserIdRaw = body.discordUserId;
    if (!discordUserIdRaw || !/^[0-9]{1,20}$/.test(discordUserIdRaw)) {
      return c.json({ error: "INVALID_DISCORD_USER_ID" }, 400);
    }

    const discordUserId = BigInt(discordUserIdRaw);
    const guilds = Array.isArray(body.guilds)
      ? body.guilds.map((g) => ({ id: BigInt(g.id), name: g.name }))
      : [];

    deps.fakeDiscordGuildProvider.setManageableGuilds(discordUserId, guilds);
    return c.json({ ok: true, count: guilds.length });
  });

  /**
   * Sets the unavailable failure simulation flag in the fake Discord provider.
   */
  router.post("/discord/unavailable", async (c) => {
    if (!deps.fakeDiscordGuildProvider) {
      return c.json({ error: "FAKE_DISCORD_PROVIDER_NOT_CONFIGURED" }, 500);
    }

    const body = (await c.req.json().catch(() => ({}))) as {
      discordUserId?: string;
      unavailable?: boolean;
    };

    const discordUserIdRaw = body.discordUserId;
    if (!discordUserIdRaw || !/^[0-9]{1,20}$/.test(discordUserIdRaw)) {
      return c.json({ error: "INVALID_DISCORD_USER_ID" }, 400);
    }

    const discordUserId = BigInt(discordUserIdRaw);
    deps.fakeDiscordGuildProvider.setUnavailable(discordUserId, body.unavailable ?? true);
    return c.json({ ok: true, unavailable: body.unavailable ?? true });
  });

  return router;
}
