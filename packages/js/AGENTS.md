# AGENTS.md — @kicbac/js

Browser loader + typed wrapper for Collect.js. Zero runtime deps, SSR-safe.
The authoritative local summary for Collect.js options and CSS properties is
`../../openapi/collectjs-options.md`. Verify against public gateway docs before
adding options.

## Layout

- `src/load.ts` — `loadKicbac()`: script injection, dedupe, retry-after-failure,
  `key_mismatch`, SSR → `null`. Module-level state; reset via
  `testing.resetKicbacForTests()`.
- `src/session.ts` — `createFieldSession()`: Collect.js is a PAGE SINGLETON
  (configure() re-draws all iframes, no teardown API). One session at a time
  (`session_conflict`); callbacks routed through a `generation` int so late
  callbacks after `destroy()` are dropped; `tokenize()` dedupes in-flight and
  arms a `timeoutDuration + 2s` grace timer.
- `src/appearance.ts` — appearance → Collect.js CSS translation. Output must be
  LITERAL values (iframes can't read host CSS vars) filtered through the PDF
  allowlists. `appearanceToCssVars` emits the `--kb-*` set for host chrome.
- `src/testing.ts` — `installMockCollectJS()` mock harness (separate entry,
  used by react/nextjs tests via vitest aliases).

## Rules

- Never emit `var(...)` into any Collect.js CSS object (tested).
- Never add a non-allowlisted CSS property without checking the PDF.
- `destroy()` must stay synchronous and idempotent (React StrictMode relies
  on destroy→recreate working in the same tick).
- Field-name normalization: Collect.js may report `ccnum` for `ccnumber`.

## Test

```sh
pnpm --filter @kicbac/js test     # dom (jsdom) + ssr (node) projects
pnpm --filter @kicbac/js typecheck && pnpm --filter @kicbac/js build
```
