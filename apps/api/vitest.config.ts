import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // DB-backed integration tests need a live Postgres + the db-setup file and
    // run via vitest.integration.config.ts instead.
    exclude: ["src/**/*.int.test.ts", "node_modules/**"],
    globals: false,
  },
});
