import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: [...configDefaults.include, `src/**/*.test.integration.{ts,tsx}`],
    exclude: [...configDefaults.exclude, `e2e/**/*`, `out/**/*`],
    coverage: {
      all: true,
      include: ["src/**/*"],
      exclude: ["**/*.test.{ts,tsx}", "**/*.test.integration.{ts,tsx}"],
    },
    setupFiles: ["./vitest.global-setup.ts"],
  },
});
