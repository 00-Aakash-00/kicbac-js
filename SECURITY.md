# Security policy

Kicbac SDKs handle payment-adjacent data and must be treated as security-sensitive software.

## Supported versions

Security fixes target the latest released minor version of each package:

- `kicbac`
- `@kicbac/js`
- `@kicbac/react`
- `@kicbac/nextjs`
- `@kicbac/themes`

## Reporting a vulnerability

Do not open a public issue for suspected vulnerabilities. Email the Kicbac maintainers with:

- affected package and version
- a concise reproduction
- expected impact
- any logs with secrets, card data, bank data, webhook keys, and security keys removed

## Handling payment data

- Tokenize cards and bank accounts with Kicbac.js. Do not post raw PAN, CVV, routing, or account values to your server.
- Store Kicbac security keys only in server-side secret stores.
- Verify webhooks with `Webhook-Signature: t=<nonce>,s=<sig>` using HMAC-SHA256 over `nonce + "." + rawBody`, compared constant-time.
- Treat `response=2` as a typed decline result, not an exception. Treat `response=3` as an error path.
- Never commit real payment credentials, live keys, raw card data, bank account numbers, or unscrubbed cassettes.
