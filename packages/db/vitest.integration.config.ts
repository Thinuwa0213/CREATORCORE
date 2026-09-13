import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/integration/**/*.test.ts"],
    testTimeout: 10_000,
    // These suites share one real, external MySQL instance, including a
    // genuinely global (non-tenant-scoped) `workers`/`worker_eligibility`
    // resource (docs/adr/0006/0011) -- running test files in parallel
    // workers could race on that shared state. Serialized, not a
    // workaround for a flaky test: this is standard practice for
    // integration suites against one shared external resource.
    fileParallelism: false,
  },
});
