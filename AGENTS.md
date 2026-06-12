# AGENTS.md — Kicbac Developer Platform

Monorepo for Kicbac's developer platform: Mintlify docs (`docs/`), the `kicbac` Node SDK and `@kicbac/*` frontend packages (`packages/`), the `kicbac` Python SDK (`sdk-python/`), examples, and Claude Code skills (`.claude/skills/`). Kicbac's gateway (`kicbac.transactiongateway.com`) uses a form-encoded API. The master plan is `todo.md`; ground-truth API data lives in `openapi/` and `../Kicbac_API_Docs/`.

Per-package `AGENTS.md` files override this one (nearest-file-wins). Read the closest one to the files you're editing.

## Setup

```sh
pnpm install            # JS workspace (pnpm ONLY — never npm/yarn)
# Python SDK (uv not installed here — pyproject is uv-compatible when it is):
cd sdk-python && python3 -m venv .venv && .venv/bin/pip install -e ".[dev]"
```

## Build & test

```sh
pnpm turbo run build                      # build all packages
pnpm turbo run test lint typecheck        # full gate (what CI runs)
pnpm --filter kicbac test                 # one package, fast iteration
pnpm --filter @kicbac/react test -- --watch
cd sdk-python && .venv/bin/pytest        # Python tests (.venv from setup above)
cd sdk-python && .venv/bin/mypy --strict src && .venv/bin/ruff check
cd docs && mint dev                       # docs preview (localhost:3000)
cd docs && mint broken-links && mint openapi-check ../openapi/kicbac.openapi.yaml
```

All tests must pass before a task is "done". PR CI is fully offline (MSW/respx/cassettes); sandbox suites run nightly only.

## Code style

- TypeScript strict; ESM-first with dual ESM+CJS publish (separate `.d.ts`/`.d.cts`). No `axios` — `fetch` only (Node 20+/edge/Bun must work). Zero/minimal runtime deps in published packages.
- Python: ruff (lint+format), mypy `--strict`, pydantic v2 models, sync (`Kicbac`) + async (`AsyncKicbac`) clients sharing one request-builder.
- Match the existing style of the file you're in. Comments only for constraints the code can't express.
- React: components must be SSR-safe (no `window` at module scope); `react` is a peerDependency.

## Kicbac API conventions (non-negotiable)

- **Tokenize with Kicbac.js hosted fields, always.** Never write code that posts raw `ccnumber`/`cvv` from a merchant's server, and never generate raw card `<input>` fields — use the iframe field components / `payment_token`.
- **Webhook verification** (the legacy `HowToUse.md` is WRONG — never copy from it): header `Webhook-Signature: t=<nonce>,s=<sig>`; valid iff `sig == HMAC_SHA256(signingKey, nonce + "." + rawBody)` over the **exact raw bytes**, compared constant-time (`crypto.timingSafeEqual` / `hmac.compare_digest`).
- **No auto-retry of `transact.php` POSTs** — they are not idempotent (only `dup_seconds` dedupe exists). Retries are allowed only for `query.php` and pre-send connection failures.
- Gateway responses are HTTP 200 always; parse `response` (1=approved / 2=declined / 3=error). Declines are typed results, not exceptions.
- Test vs live: env keys per `todo.md` conventions; test creds/cards/simulation rules in `todo.md` Appendix B; the network-test harness must assert the base URL is the test gateway before any request.
- Authenticate with `security_key` only. Never generate username/password auth or any legacy redirect/emulator integration paths.

## Working principles

**1. Think before coding.** Don't assume; don't hide confusion. State assumptions explicitly — if uncertain, ask. If multiple interpretations exist, present them rather than picking silently. If a simpler approach exists, say so and push back when warranted. If something is unclear, stop, name what's confusing, and ask.

**2. Simplicity first.** Minimum code that solves the problem; nothing speculative. No features beyond what was asked, no abstractions for single-use code, no unrequested "flexibility", no error handling for impossible scenarios. If you wrote 200 lines and it could be 50, rewrite it. Ask: "Would a senior engineer call this overcomplicated?" If yes, simplify.

**3. Surgical changes.** Touch only what you must; clean up only your own mess. Don't "improve" adjacent code, comments, or formatting; don't refactor what isn't broken; match existing style. If you notice unrelated dead code, mention it — don't delete it. Remove imports/variables your changes orphaned; leave pre-existing dead code alone. Test: every changed line traces directly to the request.

**4. Goal-driven execution.** Turn tasks into verifiable goals before starting ("add validation" → "write tests for invalid inputs, then make them pass"). For multi-step work, state a brief plan with a verify step per item, and loop until verified. Never mark a task complete without proving it works (run the tests, run the app, check the output).

## Testing map

| Code | Framework | Notes |
|---|---|---|
| `packages/kicbac` | Vitest + MSW 2 + expectTypeOf | MSW handlers parse/return form-encoded bodies; table-driven response codes from `openapi/data/` |
| `packages/react` | Vitest + @testing-library/react + jsdom | mock `window.CollectJS`; Playwright E2E lives in `examples/playground` (frameLocator for iframes) |
| `sdk-python` | pytest + respx (+ pytest-asyncio) | sync/async parametrized; shares fixtures with Node via `openapi/data/` |
| contract | Polly.js / vcrpy cassettes | scrubbed before commit; re-record nightly |
| docs | mint broken-links, snippet doctests | snippets must compile/run against built packages |

Webhook verifiers are tested against the shared golden vectors in `openapi/webhooks/vectors.json` — both SDKs must pass the identical set.

## PR / commit rules

- Changeset required for any change to a published package (`pnpm changeset`); conventional commit messages.
- A PR is mergeable only with build + lint + typecheck + tests + packaging gates (publint/attw) green.
- Never commit: secrets/keys, unscrubbed cassettes, real card data (even "expired" real PANs — test PANs from Appendix B only).

## Security (PCI)

- Never log or persist `ccnumber`, `cvv`, `checkaccount`, `checkaba`, `security_key`, or webhook signing keys — use the SDK redaction util in anything loggable.
- Cassettes/fixtures: scrub credentials and PAN-adjacent fields before commit; review diffs of `**/cassettes/**` carefully.
- Only test-mode credentials in CI secrets; live keys never leave the merchant's environment.

## Task management

- Plan multi-step work in `tasks/todo.md` (checkable items), check in before implementing, mark progress as you go, and append a review section when done.
- After any user correction, record the pattern in `tasks/lessons.md`; review it at session start.
- **API docs first:** before implementing against the gateway or any library, read the relevant docs (`openapi/`, `todo.md` Appendix E, and for Next.js the version-matched docs in `node_modules/next/dist/docs/`).
