import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/integration/**/*.test.ts"],
    testTimeout: 10_000,
    // Shares the same real external MySQL instance/global worker-identity
    // tables as packages/db's integration suite (docs/adr/0006/0011) --
    // see packages/db/vitest.integration.config.ts for why file-level
    // parallelism is disabled here too.
    fileParallelism: false,
  },
});
