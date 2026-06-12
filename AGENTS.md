# AGENTS.md - Kicbac JavaScript SDKs

Use pnpm only. Do not use npm or yarn for workspace tasks.

## Checks

```sh
pnpm install
pnpm turbo run build
pnpm turbo run typecheck
pnpm turbo run test
pnpm -r --filter "./packages/*" run check:package
```

## Security rules

- Tokenize with Collect.js or Kicbac hosted fields.
- Do not add browser or server examples that collect raw PAN, CVV, routing, or account numbers.
- Do not expose `security_key` or webhook signing keys to browser code.
- Treat `response=2` as a typed decline result.
- Treat `response=3` as an SDK error path.
- Verify webhooks with `Webhook-Signature: t=<nonce>,s=<sig>` over `nonce + "." + rawBody`.
- Keep `transact.php` retry behavior conservative; it is not idempotent.

Use `openapi/` fixtures and package READMEs as the local source of truth.
