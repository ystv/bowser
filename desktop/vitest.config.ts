import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: [...configDefaults.include, `src/**/*.test.integration.{ts,tsx}`],
    exclude: [...configDefaults.exclude, `e2e/**/*`, `out/**/*`],
    coverage: {
      all: true,
      include: ["src/**/*"],
    },
  },
});
