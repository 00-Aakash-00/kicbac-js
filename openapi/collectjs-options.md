# Collect.js option map

Source: public gateway Collect.js documentation and the installed `@kicbac/js` wrapper API.

Use Collect.js for all browser-entered card and ACH data. Server examples should send `payment_token`, not raw `ccnumber`, `cvv`, `checkaccount`, or `checkaba`.

## Script and key

- Script URL: `https://kicbac.transactiongateway.com/token/Collect.js`
- Public tokenization key: generated in the merchant control panel.
- Test card token: `00000000-000000-000000-000000000000`
- Test ACH token: `11111111-111111-111111-111111111111`
- Tokens are single-use and expire after 24 hours.

## Common configuration

| Option | Purpose |
| --- | --- |
| `variant` | Lightbox or inline collection mode. |
| `paymentSelector` | Selector for the payment button in lightbox mode. |
| `styleSniffer` | Adopt page styles automatically. |
| `googleFont` | Load a Google Font in hosted fields. |
| `customCss` | Additional CSS for hosted fields. |
| `invalidCss` | CSS applied to invalid fields. |
| `validCss` | CSS applied to valid fields. |
| `placeholderCss` | Placeholder styling. |
| `focusCss` | Focus styling. |
| `timeoutDuration` | Tokenization timeout in milliseconds. |
| `timeoutCallback` | Called when tokenization times out. |
| `fieldsAvailableCallback` | Called when hosted fields finish loading. |
| `validationCallback` | Called on field validation changes. |
| `callback` | Receives tokenization result with `payment_token`. |
| `price` | Wallet payment amount. |
| `country` | Wallet country code. |
| `currency` | Wallet currency code. |

## Field selectors

Use the SDK field abstractions (`@kicbac/js`, `@kicbac/react`, `@kicbac/nextjs`) before writing raw Collect.js configuration. If you must document raw Collect.js, include only hosted field selectors/titles/placeholders and never raw card inputs.

## Wallets

Apple Pay and Google Pay can return `payment_token` through Collect.js. Apple Pay web tokens are one-time payment tokens and should not be saved to Customer Vault.
