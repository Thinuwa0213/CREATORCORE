#!/usr/bin/env node
/**
 * Honest per-workspace test gate for CreatorCore.
 *
 * Why this exists: the foundation must never report a test category as
 * "passing" when no such tests exist, and must never require an
 * inapplicable test type (e.g. Playwright E2E for a headless bot worker).
 * Instead, each future workspace opts in explicitly via its own
 * package.json:
 *
 *   { "creatorcore": { "testGates": { "unit": true, "integration": true, "e2e": false } } }
 *
 * Contract (documented in docs/TESTING.md and docs/RELEASE_GATES.md):
 *   - No workspaces exist at all              -> NOT APPLICABLE
 *   - Workspaces exist, none declare this gate -> NOT APPLICABLE
 *   - A workspace declares the gate `true`:
 *       - it must have a matching script (`test`, `test:integration`, or
 *         `test:e2e`) in its own package.json, which this runs for real
 *       - missing script for a declared-true gate -> FAIL (not a skip)
 *       - script present -> its real exit code decides PASS/FAIL
 *
 * Usage: node scripts/check-test-gate.mjs <unit|integration|e2e>
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { listWorkspaces } from "./lib/workspaces.mjs";

const GATE = process.argv[2];
const VALID_GATES = ["unit", "integration", "e2e"];
const SCRIPT_NAME = { unit: "test", integration: "test:integration", e2e: "test:e2e" };

if (!VALID_GATES.includes(GATE)) {
  console.error(`Usage: node scripts/check-test-gate.mjs <${VALID_GATES.join("|")}>`);
  process.exit(2);
}

const repoRoot = path.resolve(fileURLToPath(import.meta.url), "../..");
const label = GATE.toUpperCase();
const workspaces = listWorkspaces(repoRoot);

if (workspaces.length === 0) {
  console.log(`${label} TESTS: NOT APPLICABLE — no packages/apps workspaces exist yet.`);
  process.exit(0);
}

const declaring = workspaces.filter((w) => w.pkg.creatorcore?.testGates?.[GATE] === true);

if (declaring.length === 0) {
  console.log(
    `${label} TESTS: NOT APPLICABLE — ${workspaces.length} workspace(s) exist ` +
      `(${workspaces.map((w) => w.name).join(", ")}) but none declare ` +
      `creatorcore.testGates.${GATE} = true.`,
  );
  process.exit(0);
}

let failed = false;
for (const ws of declaring) {
  const scriptName = SCRIPT_NAME[GATE];
  const hasScript = typeof ws.pkg.scripts?.[scriptName] === "string";
  if (!hasScript) {
    console.error(
      `${label} TESTS: FAIL — ${ws.name} declares creatorcore.testGates.${GATE} = true ` +
        `but has no "${scriptName}" script.`,
    );
    failed = true;
    continue;
  }
  console.log(`${label} TESTS: running "${scriptName}" in ${ws.name}...`);
  const result = spawnSync("pnpm", ["run", scriptName], {
    cwd: ws.dir,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (result.status !== 0) {
    console.error(`${label} TESTS: FAIL — ${ws.name} exited with code ${result.status}.`);
    failed = true;
  }
}

if (failed) {
  process.exit(1);
}
console.log(`${label} TESTS: PASS — ${declaring.length} workspace(s) verified.`);
