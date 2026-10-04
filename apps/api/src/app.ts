import { Hono } from "hono";
import type { Logger } from "@creatorcore/logger";
import type { DatabaseClient } from "@creatorcore/db";
import { createHealthRoute } from "./routes/health.js";
import { createReadyRoute, type ReadyRouteDeps } from "./routes/ready.js";
import { createWorkerExchangeRoute } from "./routes/internal/worker-exchange.js";
import { createWorkerAssignmentRoutes } from "./routes/internal/worker-assignments.js";
import { createErrorHandler } from "./error-handler.js";
import type { WorkerTokenSigningKeys } from "./lib/worker-token.js";
import { createAuthPathAllowlistMiddleware } from "./middleware/auth-path-allowlist.js";
import type { Auth } from "./auth/index.js";
import { createGuildRoutes } from "./routes/app/guilds.js";
import { createTenantResourceRoutes } from "./routes/app/tenant-resources.js";
import { createBillingRoutes } from "./routes/app/billing.js";
import { createBotRuntimeStatusRoute } from "./routes/internal/bot-runtime-status.js";
import type { DiscordGuildProvider } from "./discord/types.js";
import type { BotOnboardingService } from "./services/bot-onboarding-service.js";

import path from "node:path";
import type { CredentialService } from "./services/credential-service.js";
import type { FakeDiscordGuildProvider } from "./discord/fake-discord-guild-provider.js";
import { createTestHarnessRoutes, isTestHarnessEnabled } from "./routes/internal/test-harness.js";
import { LocalStorageService, type StorageService } from "./services/storage-service.js";

const BETTER_AUTH_MOUNT_PATH = "/api/auth";

export interface CreateAppOptions extends ReadyRouteDeps {
  logger: Logger;
  db: DatabaseClient["db"];
  signingKeys: WorkerTokenSigningKeys;
  credentialService?: CredentialService | undefined;
  auth?: Auth | undefined;
  discordGuildProvider?: DiscordGuildProvider | undefined;
  webAppOrigin?: string | undefined;
  botOnboardingService?: BotOnboardingService | undefined;
  fakeDiscordGuildProvider?: FakeDiscordGuildProvider | undefined;
  betterAuthSecret?: string | undefined;
  storageService?: StorageService | undefined;
}

/**
 * Builds the Hono app without binding a port — used both by the real
 * bootstrap (src/index.ts) and by tests (via `app.request(...)`), so
 * route/error-boundary behavior is tested without a live server or a real
 * database.
 *
 * `/internal/*` routes (docs/adr/0011) are called only by apps/worker,
 * authenticating with its own per-worker service identity and short-lived
 * scoped internal credential — never a user session (docs/adr/0002).
 */
export function createApp(options: CreateAppOptions): Hono {
  const app = new Hono();

  app.route("/health", createHealthRoute());
  app.route("/ready", createReadyRoute(options));
  app.route("/internal/workers/exchange", createWorkerExchangeRoute(options));
  app.route("/internal/worker-assignments", createWorkerAssignmentRoutes(options));

  if (options.auth) {
    const auth = options.auth;
    app.on(
      ["GET", "POST"],
      `${BETTER_AUTH_MOUNT_PATH}/*`,
      createAuthPathAllowlistMiddleware(BETTER_AUTH_MOUNT_PATH),
      (c) => auth.handler(c.req.raw),
    );
  }

  if (options.auth && options.discordGuildProvider && options.webAppOrigin) {
    app.route(
      "/app/guilds",
      createGuildRoutes({
        db: options.db,
        auth: options.auth,
        discordGuildProvider: options.discordGuildProvider,
        webAppOrigin: options.webAppOrigin,
      }),
    );
  }

  const storageService =
    options.storageService ?? new LocalStorageService({ logger: options.logger });

  app.get("/storage/*", async (c) => {
    const rawPath = c.req.path.replace(/^\/storage\/?/, "");
    const file = await storageService.readFile(rawPath);
    if (!file) {
      return c.json({ error: "NOT_FOUND" }, 404);
    }

    const ext = path.extname(rawPath).toLowerCase();
    const mimeTypes: Record<string, string> = {
      ".png": "image/png",
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".gif": "image/gif",
      ".webp": "image/webp",
    };
    const contentType = mimeTypes[ext] || "application/octet-stream";

    return new Response(new Uint8Array(file), {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
      },
    });
  });

  if (
    options.auth &&
    options.discordGuildProvider &&
    options.webAppOrigin &&
    options.botOnboardingService &&
    options.credentialService
  ) {
    app.route(
      "/app/tenants/:tenantId",
      createTenantResourceRoutes({
        db: options.db,
        auth: options.auth,
        discordGuildProvider: options.discordGuildProvider,
        webAppOrigin: options.webAppOrigin,
        botOnboardingService: options.botOnboardingService,
        credentialService: options.credentialService,
        storageService,
      }),
    );
  }

  if (options.auth && options.webAppOrigin) {
    app.route(
      "/app/tenants",
      createBillingRoutes({
        db: options.db,
        auth: options.auth,
        webAppOrigin: options.webAppOrigin,
      }),
    );
  }

  app.route("/internal/bot-runtime-status", createBotRuntimeStatusRoute(options));

  if (isTestHarnessEnabled()) {
    app.route(
      "/internal/test",
      createTestHarnessRoutes({
        db: options.db,
        fakeDiscordGuildProvider: options.fakeDiscordGuildProvider,
        betterAuthSecret: options.betterAuthSecret,
      }),
    );
  }

  app.onError(createErrorHandler(options.logger));
  app.notFound((c) => c.json({ error: "not_found" }, 404));

  return app;
}
