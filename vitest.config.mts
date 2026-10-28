import "dotenv/config";
import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    globals: true,
    // Test files that touch the database share one Postgres instance, and the
    // audit chain is global and append-only: one file appending while another
    // verifies the whole chain would see a moving target. Run files one at a
    // time so database state is only mutated by the file under test.
    fileParallelism: false,
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
      // `server-only` is a Next.js marker with no runtime module; stub it so
      // server modules can be imported in tests.
      "server-only": path.resolve(import.meta.dirname, "./tests/server-only.stub.ts"),
    },
  },
});
