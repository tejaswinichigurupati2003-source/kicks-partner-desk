import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

const src = fileURLToPath(new URL("./src", import.meta.url));

export default defineConfig({
  resolve: { alias: { "@": src, "server-only": `${src}/test/empty.ts` } },
  test: { environment: "node", include: ["src/**/*.test.ts"] },
});
