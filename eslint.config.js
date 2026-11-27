// Flat ESLint config (ESLint 9). Lean + meaningful: catches unused
// imports/vars, floating promises risks and common correctness mistakes without
// stylistic noise. Non-type-checked by default for speed across the monorepo.
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import globals from "globals";

export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/node_modules/**",
      "**/.playwright-mcp/**",
      "**/reports/**",
      "**/coverage/**",
      "**/*.config.js",
      "**/*.config.ts",
      "site/**", // marketing site: its own toolchain
      "apps/web/scripts/**",
      "**/drizzle/**",
      ".temp_files/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // Utility / e2e / browser scripts (.js/.mjs/.cjs) — Node + browser globals.
    files: ["**/*.{js,mjs,cjs}"],
    languageOptions: {
      sourceType: "module",
      globals: { ...globals.node, ...globals.browser },
    },
    rules: {
      "no-empty": ["error", { allowEmptyCatch: true }],
      "no-unused-vars": ["error", { argsIgnorePattern: "^_", caughtErrors: "none" }],
      "no-useless-escape": "off",
      // Plain JS uses the core no-unused-vars above, not the typed rule.
      "@typescript-eslint/no-unused-vars": "off",
    },
  },
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      globals: { ...globals.node, ...globals.browser },
    },
    rules: {
      // Catch dead imports/vars; underscore-prefixed are intentional.
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrors: "none" },
      ],
      // The codebase intentionally uses `any`/`as never` at a few boundaries.
      "@typescript-eslint/no-explicit-any": "off",
      // Empty catch blocks are used deliberately (best-effort cleanup).
      "no-empty": ["error", { allowEmptyCatch: true }],
      // These require type info (type-checked config); keep off here for speed.
      "@typescript-eslint/no-floating-promises": "off",
      // Intentional in this codebase: `\${VAR}` emits literal Asterisk variable
      // syntax from JS template literals, and `\x1b` strips ANSI colour codes.
      "no-useless-escape": "off",
      "no-control-regex": "off",
    },
  },
  {
    // Tests: allow non-null assertions and relaxed rules.
    files: ["**/*.test.ts", "**/*.test.tsx", "**/*.int.test.ts", "**/test/**"],
    rules: {
      "@typescript-eslint/no-non-null-assertion": "off",
      "@typescript-eslint/no-unused-vars": "warn",
    },
  },
);
