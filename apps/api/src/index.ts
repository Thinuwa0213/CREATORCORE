import { serve } from "@hono/node-server";
import { createHash } from "node:crypto";
import { ConfigValidationError } from "@creatorcore/config";
import { loadApiConfig } from "@creatorcore/config/api";
import { createLogger } from "@creatorcore/logger";
import { createDatabaseClient, checkDatabaseConnectivity } from "@creatorcore/db";
import { createApp } from "./app.js";
import type { WorkerTokenSigningKeys } from "./lib/worker-token.js";
import type {
  CredentialEncryptionKeys,
  DiscordOauthTokenEncryptionKeys,
} from "./lib/credential-crypto.js";
import { CredentialService } from "./services/credential-service.js";
import { BotOnboardingService } from "./services/bot-onboarding-service.js";
import { DiscordValidator } from "./services/discord-validator.js";
import { createAuth } from "./auth/index.js";
import { HttpDiscordGuildProvider } from "./discord/discord-guild-provider.js";
import { FakeDiscordGuildProvider } from "./discord/fake-discord-guild-provider.js";

function bootstrap() {
  let config;
  try {
    config = loadApiConfig();
  } catch (error) {
    // Config errors never include secret values (ConfigValidationError's
    // own guarantee) — safe to print directly and exit before anything
    // (including the logger, which needs config) starts.
    const message = error instanceof ConfigValidationError ? error.message : String(error);
    console.error(`[apps/api] startup failed: ${message}`);
    process.exit(1);
  }

  const logger = createLogger({ service: "apps/api", level: config.LOG_LEVEL });
  const dbClient = createDatabaseClient(config);

  // exactOptionalPropertyTypes: `previous` must be omitted entirely when
  // unset, never assigned an explicit `undefined` (which is not the same
  // thing under this tsconfig setting).
  const signingKeys: WorkerTokenSigningKeys = {
    current: config.WORKER_TOKEN_SIGNING_KEY,
    currentVersion: config.WORKER_TOKEN_SIGNING_KEY_VERSION,
    ...(config.WORKER_TOKEN_SIGNING_KEY_PREVIOUS !== undefined
      ? { previous: config.WORKER_TOKEN_SIGNING_KEY_PREVIOUS }
      : {}),
  };

  const credentialKeys: CredentialEncryptionKeys = {
    keyDomain: "bot_credential",
    current: Buffer.from(config.BOT_CREDENTIAL_ENCRYPTION_KEY, "base64url"),
    currentVersion: config.BOT_CREDENTIAL_ENCRYPTION_KEY_VERSION,
    ...(config.BOT_CREDENTIAL_ENCRYPTION_KEY_PREVIOUS !== undefined &&
    config.BOT_CREDENTIAL_ENCRYPTION_KEY_PREVIOUS_VERSION !== undefined
      ? {
          previous: Buffer.from(config.BOT_CREDENTIAL_ENCRYPTION_KEY_PREVIOUS, "base64url"),
          previousVersion: config.BOT_CREDENTIAL_ENCRYPTION_KEY_PREVIOUS_VERSION,
        }
      : {}),
  };

  const credentialService = new CredentialService({
    db: dbClient.db,
    keys: credentialKeys,
    logger,
  });

  const discordOauthTokenKeys: DiscordOauthTokenEncryptionKeys = {
    keyDomain: "discord_oauth_token",
    current: Buffer.from(config.DISCORD_OAUTH_TOKEN_ENCRYPTION_KEY, "base64url"),
    currentVersion: config.DISCORD_OAUTH_TOKEN_ENCRYPTION_KEY_VERSION,
    ...(config.DISCORD_OAUTH_TOKEN_ENCRYPTION_KEY_PREVIOUS !== undefined &&
    config.DISCORD_OAUTH_TOKEN_ENCRYPTION_KEY_PREVIOUS_VERSION !== undefined
      ? {
          previous: Buffer.from(config.DISCORD_OAUTH_TOKEN_ENCRYPTION_KEY_PREVIOUS, "base64url"),
          previousVersion: config.DISCORD_OAUTH_TOKEN_ENCRYPTION_KEY_PREVIOUS_VERSION,
        }
      : {}),
  };

  const auth = createAuth({
    db: dbClient.db,
    logger,
    webAppOrigin: config.WEB_APP_ORIGIN,
    betterAuthSecret: config.BETTER_AUTH_SECRET,
    discordClientId: config.DISCORD_CLIENT_ID,
    discordClientSecret: config.DISCORD_CLIENT_SECRET,
    discordOauthTokenKeys,
  });

  let discordGuildProvider: HttpDiscordGuildProvider | FakeDiscordGuildProvider;
  let fakeGuildProvider: FakeDiscordGuildProvider | undefined;

  if (process.env.USE_FAKE_DISCORD === "true" && process.env.NODE_ENV === "test") {
    fakeGuildProvider = new FakeDiscordGuildProvider();
    discordGuildProvider = fakeGuildProvider;
  } else {
    discordGuildProvider = new HttpDiscordGuildProvider({
      db: dbClient.db,
      keys: discordOauthTokenKeys,
      discordClientId: config.DISCORD_CLIENT_ID,
      discordClientSecret: config.DISCORD_CLIENT_SECRET,
    });
  }

  const validator =
    process.env.USE_FAKE_DISCORD === "true" && process.env.NODE_ENV === "test"
      ? new DiscordValidator({
          fetchFn: async (_url, init) => {
            const authHeader = (init?.headers as Record<string, string>)?.Authorization || "";
            if (authHeader.includes("invalid")) {
              return new Response(JSON.stringify({ message: "401: Unauthorized" }), { status: 401 });
            }
            const tokenMatch = authHeader.replace(/^Bot\s+/i, "").trim();
            let botId = "9999999999";
            if (tokenMatch) {
              const hash = createHash("sha256").update(tokenMatch).digest("hex");
              const snowflake =
                (BigInt("0x" + hash.slice(0, 14)) % 9000000000000000n) + 1000000000000000n;
              botId = snowflake.toString();
            }
            return new Response(
              JSON.stringify({ id: botId, username: "DeterministicTestBot" }),
              { status: 200, headers: { "Content-Type": "application/json" } },
            );
          },
        })
      : new DiscordValidator();

  const botOnboardingService = new BotOnboardingService({
    db: dbClient.db,
    keys: credentialKeys,
    logger,
    validator,
  });

  const app = createApp({
    logger,
    db: dbClient.db,
    checkDatabaseReady: () => checkDatabaseConnectivity(dbClient.pool),
    signingKeys,
    credentialService,
    auth,
    discordGuildProvider,
    webAppOrigin: config.WEB_APP_ORIGIN,
    botOnboardingService,
    fakeDiscordGuildProvider: fakeGuildProvider,
    betterAuthSecret: config.BETTER_AUTH_SECRET,
  });

  const server = serve({ fetch: app.fetch, port: config.PORT }, (info) => {
    logger.info("apps/api listening", { port: info.port });
  });

  async function shutdown(signal: string) {
    logger.info("apps/api shutting down", { signal });
    server.close();
    await dbClient.close();
    process.exit(0);
  }

  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}

bootstrap();
