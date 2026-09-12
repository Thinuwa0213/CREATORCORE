// @ts-check
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import eslintConfigPrettier from "eslint-config-prettier";
import globals from "globals";

/**
 * Root ESLint config for the CreatorCore foundation.
 *
 * Phase 0 scope: lints the repository's own tooling/config files
 * (this file, playwright.config.ts, scripts/**). Future packages/apps under
 * packages/* and apps/* should extend this config rather than inventing
 * their own lint rules, per docs/ARCHITECTURE.md.
 */
export default tseslint.config(
  {
    ignores: [
      "node_modules/**",
      "**/node_modules/**",
      "dist/**",
      "**/dist/**",
      "build/**",
      "**/build/**",
      ".turbo/**",
      "coverage/**",
      "playwright-report/**",
      "test-results/**",
      "packages/**",
      "apps/**",
    ],
  },
  js.configs.recommended,
  {
    files: ["**/*.ts"],
    extends: [...tseslint.configs.strict, ...tseslint.configs.stylistic],
    languageOptions: {
      parserOptions: {
        project: "./tsconfig.json",
        tsconfigRootDir: import.meta.dirname,
      },
      globals: globals.node,
    },
  },
  {
    files: ["**/*.js", "**/*.mjs"],
    languageOptions: {
      globals: globals.node,
    },
  },
  {
    rules: {
      "no-console": "off",
    },
  },
  eslintConfigPrettier,
);
