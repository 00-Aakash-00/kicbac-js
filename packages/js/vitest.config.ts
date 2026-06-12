import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "dom",
          environment: "jsdom",
          include: ["test/**/*.test.ts"],
          exclude: ["test/ssr/**"],
        },
      },
      {
        test: {
          name: "ssr",
          environment: "node",
          include: ["test/ssr/**/*.test.ts"],
        },
      },
    ],
  },
});
