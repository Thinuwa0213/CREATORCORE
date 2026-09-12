#!/usr/bin/env node
/**
 * Honest per-workspace build gate for CreatorCore.
 *
 * No buildable workspace exists yet, so this must report NOT APPLICABLE —
 * never a hard-coded success. Once a workspace under packages/* or apps/*
 * defines its own "build" script, this gate runs it for real and fails the
 * whole gate if it fails. See docs/RELEASE_GATES.md.
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { listWorkspaces } from "./lib/workspaces.mjs";

const repoRoot = path.resolve(fileURLToPath(import.meta.url), "../..");
const workspaces = listWorkspaces(repoRoot);

if (workspaces.length === 0) {
  console.log("BUILD: NOT APPLICABLE — no buildable CreatorCore application/package exists.");
  process.exit(0);
}

const buildable = workspaces.filter((w) => typeof w.pkg.scripts?.build === "string");

if (buildable.length === 0) {
  console.log(
    `BUILD: NOT APPLICABLE — ${workspaces.length} workspace(s) exist but none define a "build" script.`,
  );
  process.exit(0);
}

let failed = false;
for (const ws of buildable) {
  console.log(`BUILD: running "build" in ${ws.name}...`);
  const result = spawnSync("pnpm", ["run", "build"], {
    cwd: ws.dir,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (result.status !== 0) {
    console.error(`BUILD: FAIL — ${ws.name} exited with code ${result.status}.`);
    failed = true;
  }
}

if (failed) {
  process.exit(1);
}
console.log(`BUILD: PASS — ${buildable.length} workspace(s) built.`);
