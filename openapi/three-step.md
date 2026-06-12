# Legacy Three-Step Redirect

Three-Step Redirect is a legacy gateway integration path. Keep it as docs-only historical context; do not generate new user snippets, SDK helpers, examples, or quickstarts for it.

Kicbac's supported developer-platform path is:

1. Collect payment details in browser-hosted fields with Collect.js.
2. Send `payment_token` to the merchant server.
3. Use the server SDK or form-encoded `transact.php` request with `security_key`.

Do not recommend Authorize.Net emulator endpoints, username/password gateway auth, or raw card fields as migration shortcuts.
