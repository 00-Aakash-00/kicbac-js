# kicbac

Server-side Node.js SDK for the [Kicbac](https://kicbac.com) payments gateway.
Zero runtime dependencies, ESM + CJS, Node 20+.

```sh
npm install kicbac
# or
pnpm add kicbac
```

## Quickstart: charge a Collect.js payment token

Tokenize card data in the browser with Collect.js (never post raw card
numbers from your server), then charge the single-use token:

```ts
import Kicbac from "kicbac";

const kicbac = new Kicbac(); // reads process.env.KICBAC_SECURITY_KEY
// or: new Kicbac({ securityKey: "..." })

const result = await kicbac.transactions.sale({
  amount: "49.99", // money is always a string
  paymentToken: token, // from Collect.js on your frontend
  orderId: "order-1042",
  billing: { firstName: "Jess", lastName: "Jones", zip: "12345" },
});

if (result.ok) {
  console.log("approved", result.transactionId, result.authCode);
} else {
  // a decline is a normal, typed outcome — not an exception
  console.log("declined", result.code, result.message);
}
```

## Charge a stored customer (Customer Vault)

```ts
// Store once (e.g. during signup) — returns the vault id:
const stored = await kicbac.customers.create({
  paymentToken: token,
  billing: { firstName: "Jess", lastName: "Jones" },
});
if (!stored.ok) throw new Error(`card verification declined: ${stored.message}`);
const vaultId = stored.customerVaultId!;

// Charge it later (merchant-initiated, stored credential):
const charge = await kicbac.customers.charge({
  customerVaultId: vaultId,
  amount: "19.99",
  initiatedBy: "merchant",
  storedCredentialIndicator: "used",
  initialTransactionId: stored.transactionId,
});
```

## Webhook verification

Verify the `Webhook-Signature` header against the **exact raw body bytes**
(never `JSON.parse` + re-serialize first). The `t=` value is a nonce, not a
timestamp, and the gateway retries delivery up to ~20 times over 3 days — so
deduplicate by `event.event_id`.

Express:

```ts
import express from "express";
import { constructEvent, SignatureVerificationError } from "kicbac";

const app = express();

app.post("/webhooks/kicbac", express.raw({ type: "*/*" }), (req, res) => {
  let event;
  try {
    event = constructEvent(
      req.body, // Buffer of the raw bytes (express.raw)
      req.header("Webhook-Signature"),
      process.env.KICBAC_WEBHOOK_SIGNING_KEY!,
    );
  } catch (err) {
    if (err instanceof SignatureVerificationError) return res.sendStatus(400);
    throw err;
  }
  if (event.event_type === "transaction.sale.success") {
    // idempotency: skip if event.event_id was already processed
    console.log("paid:", event.event_body.transaction_id);
  }
  res.sendStatus(200);
});
```

Next.js (App Router):

```ts
import { NextResponse } from "next/server";
import { constructEvent, SignatureVerificationError } from "kicbac";

export async function POST(request: Request) {
  const rawBody = await request.text(); // exact raw bytes as a string
  try {
    const event = constructEvent(
      rawBody,
      request.headers.get("Webhook-Signature"),
      process.env.KICBAC_WEBHOOK_SIGNING_KEY!,
    );
    // handle event (dedupe on event.event_id)
    return NextResponse.json({ received: event.event_id });
  } catch (err) {
    if (err instanceof SignatureVerificationError) {
      return new NextResponse("invalid signature", { status: 400 });
    }
    throw err;
  }
}
```

## Error handling: results vs thrown errors

Declines come back as values; everything that prevents or breaks a request
throws a typed error:

```ts
import Kicbac, {
  KicbacError,
  ValidationError,        // bad input — nothing was sent
  ConnectionError,        // network failure; .sent: false | "unknown" | true
  TimeoutError,           // per-attempt timer elapsed (.timeoutMs)
  RateLimitError,         // HTTP 429 or response_code 301
  AuthenticationError,    // bad security key
  ProcessorError,         // processor-side error (response_code 400-461)
} from "kicbac";

try {
  const result = await kicbac.transactions.sale({ amount: "49.99", paymentToken: token });
  if (!result.ok) {
    // DECLINE: normal business outcome (insufficient funds, expired card, ...)
    showDeclineMessage(result.code, result.message);
    return;
  }
  fulfillOrder(result.transactionId);
} catch (err) {
  if (err instanceof ConnectionError && err.sent !== false) {
    // The charge MAY have gone through — query the gateway before retrying,
    // or you risk charging the customer twice. The SDK never auto-retries
    // these for exactly that reason.
    await reconcile(err);
  } else if (err instanceof RateLimitError) {
    scheduleRetryLater();
  } else if (KicbacError.isKicbacError(err)) {
    // every SDK error: stable err.code tag, redacted err.toJSON()
    logger.error(err.toJSON());
  } else {
    throw err;
  }
}
```

Notes:

- Automatic retries: `transact.php` is retried only on provably-pre-send
  connection failures (`ConnectionError{sent: false}`); read-only `query.php`
  also retries timeouts, 502/503/504, and HTTP 429 (full-jitter backoff,
  `maxRetries` defaults to 2).
- Logging: pass `logger` in the config for structured, pre-redacted request/
  response/retry entries — card numbers and keys never appear in them.
- Reporting: `kicbac.query.transactions({ condition: ["pendingsettlement"] })`
  returns an async iterator that auto-paginates.
