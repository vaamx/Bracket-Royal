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
    // Integration tests share one live Supabase DB; run files sequentially in a
    // single worker so global preconditions (e.g. "all group matches final" for
    // bracket resolution) aren't disturbed by another file's concurrent writes.
    fileParallelism: false,
    poolOptions: { forks: { singleFork: true } },
  },
  resolve: { alias: { "@": path.resolve(__dirname, ".") } },
});
