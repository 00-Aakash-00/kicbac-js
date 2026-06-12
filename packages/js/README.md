# @kicbac/js

Browser tokenization for the Kicbac payments gateway — a tiny, dependency-free
loader and typed wrapper around Kicbac.js (the gateway's hosted-iframe
tokenizer). Card data never touches your code: fields render inside gateway
iframes and you receive a single-use `payment_token`.

Using React? Start with [`@kicbac/react`](../react) (or
[`@kicbac/nextjs`](../nextjs)) instead — they're built on this package.

## Install

```sh
npm install @kicbac/js
```

## Usage

```ts
import { loadKicbac } from "@kicbac/js";

// Loads Kicbac.js once (SSR-safe: resolves null on the server).
// Key defaults to NEXT_PUBLIC_KICBAC_TOKENIZATION_KEY / VITE_KICBAC_TOKENIZATION_KEY.
const kicbac = await loadKicbac("your-tokenization-key");

const session = kicbac.createFieldSession({
  fields: {
    ccnumber: { selector: "#card-number" },
    ccexp: { selector: "#card-expiry" },
    cvv: { selector: "#card-cvv" },
  },
  onReady: () => console.log("fields mounted"),
  onChange: (fields, isValid) => console.log(fields, isValid),
});

// On your pay button click:
const { token } = await session.tokenize();
// POST the token to YOUR server, then charge it with the `kicbac` Node SDK.

// When the form goes away:
session.destroy();
```

Notes:

- Kicbac.js is a page singleton — one field session at a time
  (`session_conflict` otherwise). Tokens are single-use: after a decline,
  call `tokenize()` again.
- The **appearance API** (`appearanceToCollectCss`, `appearanceToCssVars`)
  translates one `{ variables }` object into the gateway's allowlisted iframe
  CSS plus `--kb-*` custom properties for your own chrome. Prebuilt themes
  live in `@kicbac/themes`.
- For tests, `@kicbac/js/testing` ships `installMockCollectJS()` — a full
  offline mock of the Kicbac.js global.
