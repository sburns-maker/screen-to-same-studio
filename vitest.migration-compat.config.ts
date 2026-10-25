import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/test/migration-compatibility-postgres.test.ts"],
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});
