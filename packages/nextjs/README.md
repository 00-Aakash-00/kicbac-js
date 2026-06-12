# @kicbac/nextjs

Kicbac payments for Next.js: everything from
[`@kicbac/react`](../react) (provider, payment form, fields, hooks) plus
one-line server handlers for charging tokens and verifying webhooks.

## Install

```sh
npm install @kicbac/nextjs
```

```sh
# .env.local
NEXT_PUBLIC_KICBAC_TOKENIZATION_KEY=your-tokenization-key
KICBAC_SECURITY_KEY=your-secret-security-key
KICBAC_WEBHOOK_SIGNING_KEY=your-webhook-signing-key
```

## Checkout in three files

```tsx
// app/layout.tsx
import { KicbacProvider } from "@kicbac/nextjs";

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <KicbacProvider>{children}</KicbacProvider>
      </body>
    </html>
  );
}
```

```tsx
// app/checkout/page.tsx
"use client";
import { KicbacPaymentForm } from "@kicbac/nextjs";

export default function Checkout() {
  return <KicbacPaymentForm amount="49.99" onSuccess={(p) => console.log(p.transactionId)} />;
}
```

```ts
// app/api/kicbac/route.ts
import { createKicbacRouteHandler } from "@kicbac/nextjs/server";

export const { POST } = createKicbacRouteHandler({ amount: "49.99" });
```

### The amount is always decided on your server

`createKicbacRouteHandler` throws unless you configure exactly one strategy —
client-submitted totals are never trusted:

```ts
createKicbacRouteHandler({ amount: "49.99" });                      // fixed price
createKicbacRouteHandler({
  amountResolver: async ({ body }) => getCartTotal(body.metadata),  // computed per request
  saleParams: ({ body }) => ({ orderId: body.metadata?.orderId }),  // extra gateway params
});
createKicbacRouteHandler({ allowInsecureClientAmount: true });      // prototypes ONLY
```

Responses: `200 {ok, transactionId, authCode, amount, raw}` on approval,
`402 {ok:false, code, message}` on decline (the payment form turns this into
a recoverable error state), `400` for bad requests — including anything that
looks like a raw card number — and redacted `500`s (details go to `onError`).

## Webhooks

```ts
// app/api/kicbac/webhook/route.ts
import { kicbacWebhookHandler } from "@kicbac/nextjs/server";

export const { POST } = kicbacWebhookHandler({
  "transaction.sale.success": async (event) => {
    await fulfillOrder(event.event_body);
  },
  "settlement.batch.complete": async (event) => { /* ... */ },
  "*": async (event) => console.log("kicbac event:", event.event_type),
});
```

Signatures are verified over the exact raw bytes (constant-time) before any
handler runs; invalid signatures get a 400, handler errors get a 500 so the
gateway retries (up to ~20 times over 3 days — dedupe by `event.event_id`).
The signing key comes from `KICBAC_WEBHOOK_SIGNING_KEY` or
`{ signingKey }`.

`@kicbac/nextjs` uses only web-standard `Request`/`Response` — it works in
Node and edge runtimes and has no dependency on the `next` package itself.
