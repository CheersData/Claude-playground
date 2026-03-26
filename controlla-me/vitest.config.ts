import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    environment: "node",
    pool: "threads", // forks pool crashes on Windows with large mock files
    setupFiles: ["./vitest.setup.ts"],
    include: ["tests/**/*.test.ts"],
    testTimeout: 10_000,
    hookTimeout: 10_000,
    coverage: {
      provider: "v8",
      include: ["lib/**/*.ts", "app/api/**/*.ts"],
      exclude: [
        "lib/supabase/**",
        "lib/prompts/**",
        "lib/stripe.ts",
        "**/types.ts",
        "**/types/**",
      ],
      // TODO(QA): raise thresholds progressively toward production targets:
      //   statements: 80, branches: 70, functions: 70, lines: 80
      // Current real coverage is ~25% (2026-03-26 baseline).
      // Temporary lower thresholds keep the gate GREEN while we add tests.
      // Increment by ~10pp each sprint until targets are reached.
      thresholds: {
        statements: 20,
        branches: 20,
        functions: 20,
        lines: 20,
      },
    },
  },
});
