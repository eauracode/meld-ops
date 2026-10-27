import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      // "server-only" throws outside a React server bundle; tests run server code directly.
      "server-only": fileURLToPath(new URL("./src/test/empty.ts", import.meta.url)),
    },
  },
});
