import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const WORKSPACE_ROOTS = ["packages", "apps"];

/**
 * Enumerate real pnpm workspaces (packages/* and apps/*) that currently
 * exist on disk and have a package.json. Returns [] when nothing exists yet
 * — callers must treat an empty result as NOT APPLICABLE, never as a
 * disguised pass or fail.
 */
export function listWorkspaces(repoRoot) {
  const workspaces = [];
  for (const root of WORKSPACE_ROOTS) {
    const rootDir = path.join(repoRoot, root);
    if (!existsSync(rootDir)) continue;
    for (const entry of readdirSync(rootDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const dir = path.join(rootDir, entry.name);
      const pkgJsonPath = path.join(dir, "package.json");
      if (!existsSync(pkgJsonPath)) continue;
      const pkg = JSON.parse(readFileSync(pkgJsonPath, "utf8"));
      workspaces.push({
        name: pkg.name ?? `${root}/${entry.name}`,
        dir,
        pkg,
      });
    }
  }
  return workspaces;
}
