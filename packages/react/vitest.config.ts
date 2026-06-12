import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const jsSrc = fileURLToPath(new URL("../js/src/index.ts", import.meta.url));
const jsTesting = fileURLToPath(new URL("../js/src/testing.ts", import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@kicbac/js/testing": jsTesting,
      "@kicbac/js": jsSrc,
    },
  },
  test: {
    projects: [
      {
        resolve: {
          alias: {
            "@kicbac/js/testing": jsTesting,
            "@kicbac/js": jsSrc,
          },
        },
        test: {
          name: "dom",
          environment: "jsdom",
          // Required so `import css from "./kicbac.css?raw"` yields the text
          // (vitest stubs CSS modules to empty strings when css is false).
          css: true,
          setupFiles: ["./test/setup.ts"],
          include: ["test/**/*.test.{ts,tsx}"],
          exclude: ["test/ssr/**"],
        },
      },
      {
        resolve: {
          alias: {
            "@kicbac/js/testing": jsTesting,
            "@kicbac/js": jsSrc,
          },
        },
        test: {
          name: "ssr",
          environment: "node",
          css: true,
          include: ["test/ssr/**/*.test.{ts,tsx}"],
        },
      },
    ],
  },
});
