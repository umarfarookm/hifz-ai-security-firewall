// @ts-check
import tseslint from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";
import importPlugin from "eslint-plugin-import";

/**
 * Import boundaries mirror the dependency rule in docs/architecture/HLD.md §5:
 * firewall-core must stay network- and framework-free, and nothing may import apps/web.
 */
const boundaryRules = {
  "no-restricted-imports": [
    "error",
    {
      patterns: [
        {
          group: ["**/apps/web/**", "@hifz/web", "@hifz/web/*"],
          message: "No package may import apps/web.",
        },
      ],
    },
  ],
};

export default [
  {
    ignores: ["**/dist/**", "**/.next/**", "**/node_modules/**", "**/coverage/**", "**/next-env.d.ts"],
  },
  {
    files: ["**/*.ts", "**/*.tsx"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        sourceType: "module",
        ecmaVersion: "latest",
      },
    },
    plugins: {
      "@typescript-eslint": tseslint,
      import: importPlugin,
    },
    rules: {
      ...tseslint.configs.recommended.rules,
      ...boundaryRules,
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", destructuredArrayIgnorePattern: "^_" },
      ],
    },
  },
  {
    files: ["packages/firewall-core/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@hifz/agents", "@hifz/web", "**/apps/**"],
              message: "firewall-core may only depend on @hifz/config — see HLD §5.",
            },
          ],
        },
      ],
    },
  },
];
