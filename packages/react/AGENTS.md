# AGENTS.md — @kicbac/react

React layer over `@kicbac/js`. `react`/`react-dom` are peers; everything must
be SSR-safe (no `window` at module scope; renderToString is tested).

## Layout

- `src/provider.tsx` — `KicbacProvider` (loads Collect.js in an effect,
  injects styles) + `useKicbac` tri-state. Missing key / load failure NEVER
  throws in render — it becomes `loadError`.
- `src/use-payment-form.ts` — the engine: registers field mounts
  (`getFieldProps` during render → session created in an effect), drives the
  pure reducer, guards double-submits with an in-flight promise ref, aborts
  the endpoint fetch on unmount, swallows `cancelled` rejections.
- `src/internal/machine.ts` — PURE `formReducer`
  (idle|loading|ready|tokenizing|submitting|success|error). Exhaustive
  transition table test in `test/machine.test.ts`.
- `src/internal/endpoint.ts` — `postToken`: the endpoint contract
  (200 ok / 402 decline / endpoint_http / endpoint_network). The contract is
  pinned by `packages/nextjs/test/fixtures/endpoint-contract.json` — change
  BOTH sides together.
- `src/components/` — `KicbacPaymentForm` + field primitives (context-wired,
  or explicit `form` prop for headless composition).
- `src/styles/kicbac.css` — designed artifact. Every selector specificity
  0-1-0 (state selectors wrapped in `:where()`); motion ≤300ms ease-out,
  transform/opacity only; `prefers-reduced-motion` strips transforms. The
  sheet is imported as text (`?raw`) and injected `<style id="kicbac-styles">`
  at head START. tsup needs the `raw-css` esbuild plugin; vitest needs
  `css: true`.

## Rules

- Collect.js sessions configure ONCE — never reconfigure on prop change
  (appearance changes need a remount; document, don't "fix").
- `treeshake` must stay OFF in tsup: the rollup pass strips the
  `"use client"` banner.
- Don't add `@testing-library/jest-dom` matchers — not a dependency.
- RTL auto-cleanup is off (no globals); `test/setup.ts` handles it.

```sh
pnpm --filter @kicbac/react test    # dom + ssr projects, 95 tests
```
