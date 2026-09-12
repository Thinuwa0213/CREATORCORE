// @ts-check
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import eslintConfigPrettier from "eslint-config-prettier";
import globals from "globals";

/**
 * Root ESLint config for the whole CreatorCore monorepo.
 *
 * Phase 2: this is the single lint config for repo tooling files AND every
 * workspace under packages/* and apps/*, per docs/ARCHITECTURE.md's rule
 * against duplicated/inconsistent per-workspace tooling. Each workspace's
 * own "lint" script points back at this file explicitly
 * (`eslint . --config ../../eslint.config.js`) rather than maintaining a
 * local eslint.config.js. `projectService` auto-discovers the nearest
 * tsconfig.json for each linted file, so one config works across every
 * workspace's own tsconfig without listing each path here.
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
      "**/.next/**",
      ".turbo/**",
      "coverage/**",
      "playwright-report/**",
      "test-results/**",
    ],
  },
  js.configs.recommended,
  {
    files: ["**/*.ts", "**/*.tsx"],
    extends: [...tseslint.configs.strict, ...tseslint.configs.stylistic],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
      globals: globals.node,
    },
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", destructuredArrayIgnorePattern: "^_" },
      ],
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
