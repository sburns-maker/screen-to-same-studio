import { defineConfig } from "vitest/config";

// This suite imports only postgres and Vitest and executes the real SQL migrations.
// Keep it independent of the application's React/Vite plugins and browser setup.
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/test/experience-postgres.test.ts"],
    testTimeout: 15_000,
    hookTimeout: 30_000,
  },
});
