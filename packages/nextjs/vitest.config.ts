import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@kicbac/js/testing": fileURLToPath(new URL("../js/src/testing.ts", import.meta.url)),
      "@kicbac/js": fileURLToPath(new URL("../js/src/index.ts", import.meta.url)),
      "@kicbac/react": fileURLToPath(new URL("../react/src/index.ts", import.meta.url)),
      kicbac: fileURLToPath(new URL("../kicbac/src/index.ts", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
  },
});
