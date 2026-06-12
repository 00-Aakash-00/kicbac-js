# Kicbac JavaScript SDKs

Official JavaScript and TypeScript packages for Kicbac payments.

This repository contains the npm packages used to build tokenized browser payment forms, server-side charges, Next.js route handlers, webhook verification, and reusable themes.

## Packages

| Package | Purpose |
| --- | --- |
| `kicbac` | Node.js server SDK for transactions, Customer Vault, recurring billing, Query API, and webhooks. |
| `@kicbac/js` | Dependency-free Collect.js loader and typed hosted-field session wrapper. |
| `@kicbac/react` | React provider, hooks, fields, and payment form built on hosted iframes. |
| `@kicbac/nextjs` | React exports plus web-standard Next.js route handlers for charges and webhooks. |
| `@kicbac/themes` | Serializable appearance presets for Kicbac payment components. |

## Install

```sh
pnpm add kicbac
pnpm add @kicbac/react @kicbac/themes
pnpm add @kicbac/nextjs
```

Use `@kicbac/nextjs` for Next.js apps, `@kicbac/react` for React apps with your own server, and `kicbac` for server-only integrations.

## Core safety model

- Card and bank details are tokenized in gateway-hosted Collect.js iframes.
- Your server should receive only a `payment_token`, never raw PAN, CVV, routing, or bank account values.
- Gateway HTTP responses are usually `200`; inspect the gateway `response` field.
- `response=1` is approved, `response=2` is a typed decline result, and `response=3` throws an SDK error.
- `transact.php` POSTs are not idempotent. The SDK only retries cases where it can prove no request bytes were sent.
- Webhook signatures use `Webhook-Signature: t=<nonce>,s=<sig>` and HMAC-SHA256 over `nonce + "." + rawBody`.

## Quick example

```ts
import Kicbac from "kicbac";

const kicbac = new Kicbac(); // reads KICBAC_SECURITY_KEY

const result = await kicbac.transactions.sale({
  amount: "49.99",
  paymentToken: tokenFromCollectJs,
  orderId: "order-1042",
});

if (result.ok) {
  console.log(result.transactionId);
} else {
  console.log("declined", result.code, result.message);
}
```

## Local development

```sh
pnpm install
pnpm turbo run build
pnpm turbo run typecheck
pnpm turbo run test
pnpm -r --filter "./packages/*" run check:package
```

Regenerate webhook vectors after intentional webhook fixture changes:

```sh
node openapi/scripts/make-vectors.mjs
git diff --exit-code openapi/webhooks/vectors.json
```

## Release workflow

This repo uses Changesets.

```sh
pnpm changeset
pnpm version-packages
pnpm release
```

Publishing requires npm credentials for the Kicbac packages. Do not commit credentials, `.npmrc` files with tokens, live gateway keys, or real card data.
