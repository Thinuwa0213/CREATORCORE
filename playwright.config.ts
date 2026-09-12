import { defineConfig } from "@playwright/test";

/**
 * CreatorCore E2E foundation config.
 *
 * Status: CONFIGURED AS FOUNDATION TOOLING — no product tests exist yet.
 * No dashboard or other browser-facing application exists in this repository
 * yet, so this config currently matches zero spec files. It is not invoked
 * directly by `pnpm test:e2e` — see scripts/check-test-gate.mjs, which
 * decides per-workspace (via each app's package.json `creatorcore.testGates`
 * declaration, documented in docs/TESTING.md) whether Playwright must run
 * against a given app at all before ever executing it.
 */
export default defineConfig({
  testDir: "./apps",
  testMatch: "**/e2e/**/*.spec.ts",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: [["list"]],
  use: {
    trace: "on-first-retry",
  },
});
