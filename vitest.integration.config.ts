import { defineConfig } from "vitest/config";
import path from "node:path";
import { config } from "dotenv";

config({ path: ".env.local" });

export default defineConfig({
  test: {
    environment: "node",
    include: ["lib/**/*.itest.ts"],
    setupFiles: ["./vitest.integration.setup.ts"],
    testTimeout: 20000,
    hookTimeout: 20000,
  },
  resolve: { alias: { "@": path.resolve(__dirname, ".") } },
});
