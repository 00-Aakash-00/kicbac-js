# @kicbac/react

React components and hooks for Kicbac payments: a drop-in, branded payment
form built on the gateway's hosted iframes (Collect.js). Card data never
touches your code — you get a single-use token, your server charges it.

Using Next.js? Install [`@kicbac/nextjs`](../nextjs) instead — it re-exports
everything here plus one-line server handlers.

## Install

```sh
npm install @kicbac/react
```

## Quickstart (3 steps)

**1. Set your publishable tokenization key**

```sh
# .env
NEXT_PUBLIC_KICBAC_TOKENIZATION_KEY=your-tokenization-key   # or VITE_KICBAC_TOKENIZATION_KEY
```

**2. Wrap your app**

```tsx
import { KicbacProvider } from "@kicbac/react";

<KicbacProvider>
  <App />
</KicbacProvider>;
```

**3. Drop in the payment form**

```tsx
import { KicbacPaymentForm } from "@kicbac/react";

<KicbacPaymentForm
  amount="49.99"
  onSuccess={(payment) => router.push(`/thanks?id=${payment.transactionId}`)}
/>;
```

That's it. The form renders card fields with validation states, a gradient
pay button with loading/success animations, and inline error display. On
submit it tokenizes in the gateway iframes and POSTs
`{ token, amount, currency, metadata }` to `/api/kicbac` (configurable via
`endpoint`) — pair it with `createKicbacRouteHandler` from `@kicbac/nextjs`,
or any server route that charges the token with the `kicbac` Node SDK.
Styles are injected automatically (set `injectStyles={false}` and
`import "@kicbac/react/styles.css"` to manage them yourself).

## Appearance

One object themes everything — including the inputs inside the gateway
iframes (Kicbac translates your variables into the gateway's restricted
iframe CSS for you):

```tsx
import { darkTheme } from "@kicbac/themes";

<KicbacPaymentForm
  amount="49.99"
  appearance={{
    baseTheme: darkTheme,                          // optional preset
    variables: {
      colorPrimary: "#7c3aed",
      borderRadius: "8px",
      fontFamily: "'DM Sans', sans-serif",
    },
    elements: { button: "my-pay-button" },          // extra class per kb-* slot
  }}
/>;
```

The same prop on `<KicbacProvider appearance={...}>` sets app-wide defaults
(form-level appearance wins per key). All chrome uses stable `kb-*` classes
at specificity 0-1-0, so your CSS always wins.

## Headless

```tsx
const form = usePaymentForm({ onToken: async (res) => myCharge(res.token) });

<div {...form.getFieldProps("ccnumber")} />   // mount points for the iframes
<button onClick={() => form.submit()} disabled={!form.isValid}>Pay</button>
// form.status: idle|loading|ready|tokenizing|submitting|success|error
```

Field primitives (`CardNumberField`, `CardExpiryField`, `CardCvvField`,
`BankAccountField`, `BankRoutingField`, `BankAccountNameField`) compose with
either `<KicbacPaymentForm>` or your own `usePaymentForm` via the `form` prop.

## Testing your integration

```ts
import { installMockCollectJS } from "@kicbac/js/testing";
const mock = installMockCollectJS();   // offline Collect.js mock
```
