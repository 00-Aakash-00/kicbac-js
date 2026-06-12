// Vite-style raw import — the stylesheet as a string (see tsup.config.ts for
// the matching esbuild loader).
declare module "*.css?raw" {
  const css: string;
  export default css;
}
