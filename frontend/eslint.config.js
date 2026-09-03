import js from "@eslint/js";
import globals from "globals";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";

/**
 * Flat config for the SPA. The frontend had no lint configuration at all, so
 * the class of bug that hooks rules exist to catch — stale closures, effects
 * missing a dependency, a hook called conditionally — was invisible in review.
 *
 * Rules are set at the level the existing code can actually hold: correctness
 * rules are errors, and stylistic preferences are left out entirely so that a
 * failing lint run always means something is wrong.
 */
export default [
  { ignores: ["dist/**", "node_modules/**"] },
  js.configs.recommended,
  {
    // Playwright specs and build scripts run in Node, not the browser.
    files: ["e2e/**/*.js", "scripts/**/*.{js,mjs}", "*.config.js"],
    languageOptions: { globals: { ...globals.node } },
  },
  {
    files: ["**/*.{js,jsx}"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: { ...globals.browser },
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: {
      react,
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // Without this, every component referenced only from JSX looks unused to
      // no-unused-vars — which reported 96 dead imports that were nothing of
      // the kind. JSX references are references.
      "react/jsx-uses-vars": "error",
      // An unused argument is usually a signature being honoured; an unused
      // local is usually a leftover. Treat them differently.
      "no-unused-vars": ["error", {
        args: "none",
        varsIgnorePattern: "^_",
        ignoreRestSiblings: true,
      }],
      // Fast refresh only works when a module exports components alone; this is
      // a warning because the fix is sometimes a file split.
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],

      // The two below are real findings kept as warnings so that a *failing*
      // lint run always means something new is broken. Both need refactoring
      // rather than a fix, and the counts are recorded in the review notes so
      // they stay visible instead of quietly becoming the norm:
      //   static-components   — a component declared inside another remounts on
      //                         every render, losing its state and focus.
      //   set-state-in-effect — cascading renders; usually derived state that
      //                         should be computed, not stored.
      "react-hooks/static-components": "warn",
      "react-hooks/set-state-in-effect": "warn",
    },
  },
];
