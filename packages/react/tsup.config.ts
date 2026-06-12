import { readFile } from "node:fs/promises";
import path from "node:path";
import { defineConfig, type Options } from "tsup";

type EsbuildPlugin = NonNullable<Options["esbuildPlugins"]>[number];

// Support Vite-style `import css from "./kicbac.css?raw"` (vitest/vite handle
// it natively; esbuild needs this loader).
const rawCss: EsbuildPlugin = {
  name: "raw-css",
  setup(build) {
    build.onResolve({ filter: /\.css\?raw$/ }, (args) => ({
      path: path.resolve(args.resolveDir, args.path.replace(/\?raw$/, "")),
      namespace: "raw-css",
    }));
    build.onLoad({ filter: /.*/, namespace: "raw-css" }, async (args) => ({
      contents: await readFile(args.path, "utf8"),
      loader: "text",
    }));
  },
};

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm", "cjs"],
  dts: true,
  sourcemap: true,
  clean: true,
  target: "es2022",
  // treeshake (rollup pass) strips module-level directives, which would drop
  // the "use client" banner Next.js App Router needs. The package is
  // sideEffects:false, so consumers still treeshake it fine.
  treeshake: false,
  external: ["react", "react-dom"],
  esbuildPlugins: [rawCss],
  banner: {
    js: '"use client";',
  },
});
