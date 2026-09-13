import { defineConfig, devices } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.dirname(fileURLToPath(import.meta.url));

if (!process.env.DATABASE_URL && typeof process.loadEnvFile === "function") {
  const envPath = path.join(rootDir, ".env");
  if (fs.existsSync(envPath)) {
    process.loadEnvFile(envPath);
  }
}

/**
 * CreatorCore E2E configuration.
 * Configured with two webServer instances:
 * 1. apps/api on port 8787 with test harness enabled and FakeDiscordGuildProvider
 * 2. apps/web on port 3000 pointing to apps/api
 */
export default defineConfig({
  testDir: "./apps",
  testMatch: "**/e2e/**/*.spec.ts",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: [
    {
      command: "node apps/api/dist/index.js",
      url: "http://localhost:8787/ready",
      timeout: 30000,
      reuseExistingServer: !process.env.CI,
      cwd: rootDir,
      env: {
        DATABASE_URL: process.env.DATABASE_URL ?? "",
        PORT: "8787",
        NODE_ENV: "test",
        LOG_LEVEL: "warn",
        WORKER_TOKEN_SIGNING_KEY: "0123456789012345678901234567890123456789",
        WORKER_TOKEN_SIGNING_KEY_VERSION: "1",
        BOT_CREDENTIAL_ENCRYPTION_KEY: "MDEyMzQ1Njc4OTAxMjM0NTY3ODkwMTIzNDU2Nzg5MDE",
        BOT_CREDENTIAL_ENCRYPTION_KEY_VERSION: "1",
        BETTER_AUTH_SECRET: "0123456789012345678901234567890123456789",
        WEB_APP_ORIGIN: "http://localhost:3000",
        DISCORD_CLIENT_ID: "dummy-client-id",
        DISCORD_CLIENT_SECRET: "dummy-client-secret",
        DISCORD_OAUTH_TOKEN_ENCRYPTION_KEY: "MTIzNDU2Nzg5MDEyMzQ1Njc4OTAxMjM0NTY3ODkwMTI",
        DISCORD_OAUTH_TOKEN_ENCRYPTION_KEY_VERSION: "1",
        USE_FAKE_DISCORD: "true",
        ENABLE_E2E_TEST_HARNESS: "true",
      },
    },
    {
      command: "npx next start -p 3000",
      url: "http://localhost:3000",
      timeout: 30000,
      reuseExistingServer: !process.env.CI,
      cwd: path.join(rootDir, "apps/web"),
      env: {
        NODE_ENV: "test",
        PORT: "3000",
        API_INTERNAL_URL: "http://localhost:8787",
        NEXT_PUBLIC_APP_NAME: "CreatorCore",
      },
    },
  ],
});
