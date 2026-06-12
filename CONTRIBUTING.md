# Contributing

Thanks for improving the Kicbac JavaScript SDKs.

## Setup

Use pnpm only:

```sh
pnpm install
```

Node.js 20.19 or newer is required.

## Development checks

Run the full local gate before opening a pull request:

```sh
pnpm turbo run build
pnpm turbo run typecheck
pnpm turbo run test
pnpm -r --filter "./packages/*" run check:package
node openapi/scripts/make-vectors.mjs
git diff --exit-code openapi/webhooks/vectors.json
```

## API and PCI rules

- Do not add server-side examples that accept raw card numbers, CVV, routing numbers, or bank account numbers.
- Use Kicbac.js tokenization and pass `paymentToken` to the server SDK.
- Keep `transact.php` retry behavior conservative. It is not idempotent.
- Keep declines as typed results. Only gateway errors, validation failures, authentication errors, rate limits, and transport failures should throw.
- Keep webhook verification byte-exact and constant-time.

## Changesets

Any user-facing package change needs a Changeset:

```sh
pnpm changeset
```

Do not include secrets, live keys, raw PANs, or unscrubbed network cassettes in commits.
