import type { KicbacWebhookEvent } from "./types.js";

export type KicbacWebhookHandler = (event: KicbacWebhookEvent) => void | Promise<void>;

/**
 * Handlers keyed by exact event type (e.g. `"transaction.sale.success"`).
 * A `"*"` handler receives every verified event (after the exact handler).
 */
export type KicbacWebhookHandlers = Record<string, KicbacWebhookHandler>;

export interface KicbacWebhookHandlerOptions {
  /** Webhook signing key; defaults to `KICBAC_WEBHOOK_SIGNING_KEY`. */
  signingKey?: string;
}

interface KicbacWebhooksModule {
  constructEvent(
    rawBody: string | Uint8Array,
    signatureHeader: string | null | undefined,
    signingKey: string,
  ): KicbacWebhookEvent;
}

// The `kicbac` package is imported lazily at first request so this module
// loads (and tests) independently of the server SDK build.
let kicbacModulePromise: Promise<KicbacWebhooksModule> | null = null;
function loadKicbacModule(): Promise<KicbacWebhooksModule> {
  kicbacModulePromise ??= import("kicbac") as unknown as Promise<KicbacWebhooksModule>;
  return kicbacModulePromise;
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/**
 * One-line verified webhook endpoint for `app/api/kicbac/webhook/route.ts`:
 *
 * ```ts
 * import { kicbacWebhookHandler } from "@kicbac/nextjs/server";
 * export const { POST } = kicbacWebhookHandler({
 *   "transaction.sale.success": async (event) => { ... },
 *   "*": async (event) => console.log(event.eventType),
 * });
 * ```
 *
 * Reads the raw body FIRST (signatures verify exact bytes), verifies the
 * `Webhook-Signature` header via the `kicbac` SDK, returns 400 for signature
 * or format failures, 500 when a handler throws (so the gateway retries),
 * and `200 {"received":true}` otherwise.
 *
 * Note: the `t=` component of the signature header is a nonce, not a
 * timestamp — dedupe deliveries by `event.event_id` (the gateway retries up
 * to ~20 times over 3 days).
 */
export function kicbacWebhookHandler(
  handlers: KicbacWebhookHandlers,
  options?: KicbacWebhookHandlerOptions,
): { POST: (request: Request) => Promise<Response> } {
  const POST = async (request: Request): Promise<Response> => {
    // Exact raw bytes first — `request.text()` decodes as UTF-8 and silently
    // replaces any non-UTF-8 byte, which would corrupt the signed payload and
    // reject otherwise-valid webhooks. `arrayBuffer()` preserves bytes exactly.
    const rawBody = new Uint8Array(await request.arrayBuffer());
    const signatureHeader = request.headers.get("webhook-signature");

    const signingKey =
      options?.signingKey ??
      (typeof process !== "undefined" ? process.env["KICBAC_WEBHOOK_SIGNING_KEY"] : undefined);
    if (!signingKey) {
      return json(500, {
        received: false,
        error:
          "Missing webhook signing key: set KICBAC_WEBHOOK_SIGNING_KEY or pass { signingKey } " +
          "to kicbacWebhookHandler(). The key is in the Kicbac merchant portal webhook settings.",
      });
    }

    let event: KicbacWebhookEvent;
    try {
      const kicbac = await loadKicbacModule();
      event = kicbac.constructEvent(rawBody, signatureHeader, signingKey);
    } catch (error) {
      if (
        error instanceof Error &&
        (error.name === "SignatureVerificationError" || error.name === "WebhookParseError")
      ) {
        return json(400, { received: false, error: error.name });
      }
      return json(500, { received: false, error: "webhook_processing_failed" });
    }

    try {
      await handlers[event.event_type]?.(event);
      await handlers["*"]?.(event);
    } catch {
      // Signal failure so the gateway retries the delivery.
      return json(500, { received: false });
    }
    return json(200, { received: true });
  };

  return { POST };
}
