import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Generated / runtime
    "node_modules/**",
    "coverage/**",
    "playwright-report/**",
    "test-results/**",
    ".cc10x/**",
    ".a5c/**",
    "planning/**",
    "process/**",
  ]),
  {
    // Dependency-direction rule (M1 requirement):
    // lib/render-engine/**, lib/schemas/**, lib/ai/** (except factory.ts)
    // may not import from app/**, lib/db/**, lib/auth/**
    // This is enforced here at the file level — deeper boundary enforcement
    // is added per-directory in M2+ once those directories exist.
    files: [
      "src/lib/render-engine/**",
      "src/lib/schemas/**",
      "src/lib/ai/**",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          // ESLint 9 flat config: use the array-of-strings form for patterns
          // Pattern matching is name-based; paths are preferred for exactness.
          paths: [
            {
              name: "@/lib/db",
              message:
                "lib/render-engine, lib/schemas, and lib/ai (except factory.ts) must not import from lib/db. See 04-master-plan §5.",
            },
            {
              name: "@/lib/auth",
              message:
                "lib/render-engine, lib/schemas, and lib/ai (except factory.ts) must not import from lib/auth. See 04-master-plan §5.",
            },
          ],
        },
      ],
    },
  },
]);

export default eslintConfig;
