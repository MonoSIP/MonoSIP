import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: false,
    include: ["src/**/*.int.test.ts"],
    setupFiles: ["src/test/db-setup.ts"],
    // Integration tests share one Postgres schema; never run them concurrently.
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 20_000,
  },
});