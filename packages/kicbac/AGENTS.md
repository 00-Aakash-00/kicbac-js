# AGENTS.md — `kicbac` (Node server SDK)

Delta over the root `AGENTS.md`. Zero runtime dependencies — never add one.

## Build & test

```sh
pnpm --filter kicbac test           # vitest run --typecheck (includes test/*.test-d.ts)
pnpm --filter kicbac build          # tsup -> dist (ESM+CJS, .d.ts/.d.cts)
pnpm --filter kicbac typecheck      # tsc --noEmit
pnpm --filter kicbac check:package  # publint + attw
```

Tests are fully offline (msw 2, `onUnhandledRequest: "error"`). Webhook tests
are driven from `openapi/webhooks/vectors.json`; response-code tests from
`openapi/data/response-codes.json` (read from disk — keep them in sync, a
parity test enforces it for the inlined tables in `src/codes.ts`).

## Double-charge invariant (DO NOT WEAKEN)

`transact.php` is not idempotent. The retry logic in `src/transport.ts`
re-sends a transact request ONLY for `ConnectionError{sent: false}` — failures
provably raised before any bytes left the machine (DNS/connect/TLS cause
codes). Timeouts, HTTP 5xx, ECONNRESET (`sent: "unknown"`), body-read failures
(`sent: true`), and `response_code=301` are NEVER retried on transact. Any
change here must keep `test/retry.test.ts` exact-attempt-count assertions
passing. `query.php` is read-only and retried more aggressively — never blur
the two policies.

## Redaction rule (PCI)

All request params pass through `src/redact.ts` before they can reach a log,
an error `request` field, or `toJSON()`: `ccnumber`/`cc_number` are masked to
`****<last4>`, everything else in `REDACT_KEYS` becomes `[REDACTED]`. Error
*messages* must never interpolate caller-provided values. New gateway params
that carry secrets must be added to `REDACT_KEYS` (and `test/redact.test.ts`
covers every entry automatically).

## Conventions

- Declines (`response=2`) are `{ ok: false }` results, never exceptions;
  `response=3` throws from the `GatewayError` taxonomy (`src/errors.ts`).
- Money values are strings (`"49.99"`); validation lives in `src/validate.ts`.
- Gateway param names are irregular (`ccnumber`, `orderid`,
  `shipping_firstname`, `dup_seconds`, ...). Verify against `openapi/` and
  public gateway docs before adding mappings.
- `plans` has no delete method on purpose: the gateway has no `delete_plan`
  action.
