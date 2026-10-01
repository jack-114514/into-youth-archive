import { defineConfig, globalIgnores } from "eslint/config";
import eslint from "@eslint/js";
import next from "@next/eslint-plugin-next";
import jsxA11y from "eslint-plugin-jsx-a11y";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import tseslint from "typescript-eslint";

const eslintConfig = defineConfig([
  { ignores: ["public/assets/desktop-pet/live2dcubismcore.min.js", ".cache/**"] },
  globalIgnores([
    ".next/**",
    ".vinext/**",
    ".wrangler/**",
    "dist/**",
    "vps-dist/**",
    "out/**",
    "build/**",
    "public-release/**",
    "github-upload-ready/**",
    "mobile-admin-app/**",
    "next-env.d.ts",
  ]),
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  react.configs.flat.recommended,
  react.configs.flat["jsx-runtime"],
  reactHooks.configs.flat["recommended-latest"],
  jsxA11y.flatConfigs.recommended,
  next.configs["core-web-vitals"],
  {
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
        ...globals.serviceworker,
      },
    },
    settings: {
      react: {
        version: "detect",
      },
    },
    rules: {
      "@next/next/no-img-element": "warn",
      "@next/next/no-html-link-for-pages": "warn",
      "react-hooks/immutability": "warn",
      "react-hooks/preserve-manual-memoization": "warn",
      "react-hooks/purity": "warn",
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/use-memo": "warn",
    },
  },
  {
    files: ["components/MemoryGalaxy.tsx"],
    rules: {
      "react/no-unknown-property": "off",
    },
  },
]);

export default eslintConfig;
