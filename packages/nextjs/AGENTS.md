# AGENTS.md — @kicbac/nextjs

Two entries: `"."` re-exports `@kicbac/react` (client); `"./server"` is the
server surface. HARD RULES:

- NEVER import `next` — web-standard `Request`/`Response` only (works on
  Node + edge).
- The `kicbac` package is imported LAZILY (inside the first request) and the
  code types against the structural interfaces in `src/server/types.ts`, so
  this package compiles/tests independently of the server SDK. Tests stub
  `kicbac` via `vi.mock` — never import it directly in tests.
- The webhook event envelope is snake_case (`event_id`/`event_type`/
  `event_body`) — it mirrors what `kicbac`'s `constructEvent` returns.
- Gateway errors are detected by `error.name` (GatewayError /
  AuthenticationError / InvalidRequestError / ProcessorError) → 402; never
  `instanceof` against the lazily-imported module.

## Invariants (tested)

- `createKicbacRouteHandler` throws at FACTORY time unless exactly one of
  `amount` | `amountResolver` | `allowInsecureClientAmount` is set.
- PAN-shaped tokens (13–19 digits after stripping spaces/dashes) → 400 and
  the digits are never echoed.
- 500 bodies are redacted; details only reach `onError`.
- Webhooks: `await request.text()` FIRST (exact raw bytes), header read
  case-insensitively, 400 on SignatureVerificationError/WebhookParseError,
  exact handler then `"*"`, handler throw → 500, else `200 {"received":true}`.
- `test/webhooks.test.ts` is driven from `openapi/webhooks/vectors.json`
  (shared golden vectors). `test/fixtures/endpoint-contract.json` pins the
  200/402 bodies for BOTH this handler and `@kicbac/react`'s `postToken` —
  update both sides together.

```sh
pnpm --filter @kicbac/nextjs test
```
