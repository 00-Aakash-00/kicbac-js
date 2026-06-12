/**
 * Webhook handler tests driven from the shared golden vectors
 * (openapi/webhooks/vectors.json). The `kicbac` package is stubbed with a
 * reference constructEvent (Appendix C scheme: HMAC-SHA256 over
 * `nonce + "." + rawBody`, constant-time compare) so this suite runs
 * independently of the server SDK build — the SDK itself is tested against
 * the identical vectors in packages/kicbac.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

class SignatureVerificationError extends Error {
  override readonly name = "SignatureVerificationError";
}
class WebhookParseError extends Error {
  override readonly name = "WebhookParseError";
}

function referenceConstructEvent(
  rawBody: string | Uint8Array,
  signatureHeader: string | null | undefined,
  signingKey: string,
): { event_id: string; event_type: string; event_body: Record<string, unknown> } {
  if (signatureHeader == null || signatureHeader.trim() === "") {
    throw new SignatureVerificationError("Missing Webhook-Signature header");
  }
  const match = /^t=([^,]+),s=([0-9a-fA-F]{64})$/.exec(signatureHeader.trim());
  if (!match || !match[1]) throw new SignatureVerificationError("Malformed header");
  const bodyBytes = typeof rawBody === "string" ? Buffer.from(rawBody, "utf8") : Buffer.from(rawBody);
  const expected = createHmac("sha256", signingKey)
    .update(Buffer.concat([Buffer.from(`${match[1]}.`, "utf8"), bodyBytes]))
    .digest();
  const provided = Buffer.from(match[2]!, "hex");
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
    throw new SignatureVerificationError("Signature mismatch");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(bodyBytes.toString("utf8"));
  } catch {
    throw new WebhookParseError("Payload is not valid JSON");
  }
  const event = parsed as Record<string, unknown> | null;
  if (
    !event ||
    typeof event !== "object" ||
    typeof event["event_id"] !== "string" ||
    typeof event["event_type"] !== "string" ||
    !("event_body" in event)
  ) {
    throw new WebhookParseError("Payload is not a webhook event envelope");
  }
  return {
    event_id: event["event_id"],
    event_type: event["event_type"],
    event_body: event["event_body"] as Record<string, unknown>,
  };
}

vi.mock("kicbac", () => ({ constructEvent: referenceConstructEvent }));

import { kicbacWebhookHandler } from "../src/server/index.js";
import type { KicbacWebhookEvent } from "../src/server/index.js";

interface Vector {
  name: string;
  signing_key: string;
  payload_base64: string;
  sig_header: string | null;
  expect: "event" | "missing_header" | "format_error" | "signature_mismatch" | "payload_error" | "envelope_error";
  event_type?: string;
  note?: string;
}

const vectorsFile = JSON.parse(
  readFileSync(
    fileURLToPath(new URL("../../../openapi/webhooks/vectors.json", import.meta.url)),
    "utf8",
  ),
) as { signing_key: string; vectors: Vector[] };

function webhookRequest(vector: Vector): Request {
  const headers = new Headers();
  if (vector.sig_header !== null && vector.sig_header !== undefined) {
    // Header name casing must not matter (the handler reads via Headers.get).
    headers.set("Webhook-Signature", vector.sig_header);
  }
  return new Request("http://localhost/api/kicbac/webhook", {
    method: "POST",
    headers,
    body: Buffer.from(vector.payload_base64, "base64"),
  });
}

const VALID = vectorsFile.vectors.find((v) => v.name === "valid-real-transaction-sale-success")!;

beforeEach(() => {
  vi.stubEnv("KICBAC_WEBHOOK_SIGNING_KEY", "");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("golden vectors", () => {
  for (const vector of vectorsFile.vectors) {
    if (vector.expect === "event") {
      it(`${vector.name} → 200, handler called with the typed event`, async () => {
        const handler = vi.fn();
        const { POST } = kicbacWebhookHandler(
          { [vector.event_type!]: handler },
          { signingKey: vector.signing_key },
        );
        const res = await POST(webhookRequest(vector));
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ received: true });
        expect(handler).toHaveBeenCalledTimes(1);
        const event = handler.mock.calls[0]![0] as KicbacWebhookEvent;
        expect(event.event_type).toBe(vector.event_type);
        expect(typeof event.event_id).toBe("string");
        expect(event.event_body).toBeTypeOf("object");
      });
    } else {
      it(`${vector.name} → 400, handler NOT called (${vector.expect})`, async () => {
        const handler = vi.fn();
        const star = vi.fn();
        const { POST } = kicbacWebhookHandler(
          { "transaction.sale.success": handler, "*": star },
          { signingKey: vector.signing_key },
        );
        const res = await POST(webhookRequest(vector));
        expect(res.status).toBe(400);
        expect(handler).not.toHaveBeenCalled();
        expect(star).not.toHaveBeenCalled();
      });
    }
  }
});

describe("dispatch semantics", () => {
  it("'*' fallback receives events that have no exact handler", async () => {
    const star = vi.fn();
    const { POST } = kicbacWebhookHandler({ "*": star }, { signingKey: VALID.signing_key });
    const res = await POST(webhookRequest(VALID));
    expect(res.status).toBe(200);
    expect(star).toHaveBeenCalledTimes(1);
    expect((star.mock.calls[0]![0] as KicbacWebhookEvent).event_type).toBe(VALID.event_type);
  });

  it("dispatches the exact handler first, then '*'", async () => {
    const order: string[] = [];
    const { POST } = kicbacWebhookHandler(
      {
        [VALID.event_type!]: () => {
          order.push("exact");
        },
        "*": () => {
          order.push("star");
        },
      },
      { signingKey: VALID.signing_key },
    );
    await POST(webhookRequest(VALID));
    expect(order).toEqual(["exact", "star"]);
  });

  it("unknown event with no handler still returns 200 (acknowledge delivery)", async () => {
    const { POST } = kicbacWebhookHandler(
      { "settlement.batch.complete": vi.fn() },
      { signingKey: VALID.signing_key },
    );
    const res = await POST(webhookRequest(VALID));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });

  it("handler throw → 500 so the gateway retries", async () => {
    const { POST } = kicbacWebhookHandler(
      {
        [VALID.event_type!]: () => {
          throw new Error("db write failed");
        },
      },
      { signingKey: VALID.signing_key },
    );
    const res = await POST(webhookRequest(VALID));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ received: false });
  });

  it("async handler rejection → 500", async () => {
    const { POST } = kicbacWebhookHandler(
      { "*": async () => Promise.reject(new Error("boom")) },
      { signingKey: VALID.signing_key },
    );
    const res = await POST(webhookRequest(VALID));
    expect(res.status).toBe(500);
  });
});

describe("signing key resolution", () => {
  it("missing key → 500 with an error naming KICBAC_WEBHOOK_SIGNING_KEY", async () => {
    const { POST } = kicbacWebhookHandler({ "*": vi.fn() });
    const res = await POST(webhookRequest(VALID));
    expect(res.status).toBe(500);
    expect(await res.text()).toContain("KICBAC_WEBHOOK_SIGNING_KEY");
  });

  it("falls back to the KICBAC_WEBHOOK_SIGNING_KEY env var", async () => {
    vi.stubEnv("KICBAC_WEBHOOK_SIGNING_KEY", VALID.signing_key);
    const handler = vi.fn();
    const { POST } = kicbacWebhookHandler({ [VALID.event_type!]: handler });
    const res = await POST(webhookRequest(VALID));
    expect(res.status).toBe(200);
    expect(handler).toHaveBeenCalledTimes(1);
  });
});

describe("non-UTF8 body bytes survive signature verification", () => {
  it("verifies a body containing raw non-UTF8 bytes (arrayBuffer, not text)", async () => {
    const { createHmac } = await import("node:crypto");
    const signingKey = "whsec_test_kicbac_8675309";
    // A valid JSON envelope whose bytes include a stray 0xFF — text() would
    // replace it with U+FFFD and break the HMAC.
    const json = JSON.stringify({
      event_id: "evt_bin",
      event_type: "transaction.sale.success",
      event_body: { note: "ok" },
    });
    const body = Buffer.concat([Buffer.from(json, "utf8"), Buffer.from([0xff, 0xfe])]);
    // Sign a body that is NOT valid JSON (trailing bytes) so we only assert the
    // signature survives; expect a 400 parse error, NOT a 400 signature error.
    const nonce = "binbinbinbin0001";
    const sig = createHmac("sha256", signingKey)
      .update(Buffer.concat([Buffer.from(`${nonce}.`), body]))
      .digest("hex");
    const handler = vi.fn();
    const { POST } = kicbacWebhookHandler(
      { "transaction.sale.success": handler },
      { signingKey },
    );
    const req = new Request("http://localhost/api/kicbac/webhook", {
      method: "POST",
      headers: { "Webhook-Signature": `t=${nonce},s=${sig}` },
      body,
    });
    const res = await POST(req);
    // The reference verifier compares exact bytes: if text() had mangled them
    // the signature would FAIL (different status/no handler). Here the bytes
    // match, the signature is accepted, and the trailing-byte body fails JSON
    // parsing → 400 WebhookParseError, proving byte-exact delivery.
    const payload = (await res.json()) as { error?: string };
    expect(res.status).toBe(400);
    expect(payload.error).not.toBe("SignatureVerificationError");
  });
});
