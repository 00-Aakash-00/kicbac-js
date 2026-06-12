import { createHmac, timingSafeEqual } from "node:crypto";
import { SignatureVerificationError, ValidationError, WebhookParseError } from "./errors";
import type { KicbacEvent } from "./types/webhooks";

/** The HTTP header carrying the webhook signature. */
export const SIGNATURE_HEADER = "Webhook-Signature";

/**
 * Strict signature format: `t=<nonce>,s=<64 lowercase/uppercase hex chars>`.
 * Validated BEFORE any hex decoding — `Buffer.from(hex)` silently truncates
 * invalid input, and a short signature would make `timingSafeEqual` throw.
 * The nonce is bounded (visible ASCII, no comma, max 256 chars) so an
 * attacker-controlled header cannot smuggle control characters into logs or
 * force megabyte-sized regex captures.
 */
const SIGNATURE_RE = /^t=([\x21-\x2B\x2D-\x7E]{1,256}),s=([0-9a-fA-F]{64})$/;

/** Hard cap on the header before any regex work (cheap DoS guard). */
const MAX_HEADER_LENGTH = 512;

/**
 * Verify and parse a gateway webhook.
 *
 * `rawBody` MUST be the exact raw request bytes — do not `JSON.parse` and
 * re-serialize first (the signature is over the original bytes, including
 * whitespace and trailing newlines). In Express use `express.raw()`; in
 * Next.js / web-standard handlers prefer
 * `new Uint8Array(await request.arrayBuffer())` — `request.text()` decodes as
 * UTF-8 and silently replaces any non-UTF-8 byte, corrupting the signed
 * bytes.
 *
 * The `t=` value is a **nonce, not a timestamp** — replay windows cannot be
 * enforced from the header. The gateway redelivers events up to ~20 times
 * over 3 days, so deduplicate by `event_id` (e.g. a unique key in your
 * database) before acting on an event.
 *
 * @param rawBody Exact raw request body (string or bytes).
 * @param signatureHeader Value of the `Webhook-Signature` header.
 * @param signingKey Webhook signing key from Settings > Webhooks.
 * @throws ValidationError when `signingKey` is empty.
 * @throws SignatureVerificationError when the header is missing, malformed,
 *   or the HMAC does not match (constant-time comparison).
 * @throws WebhookParseError when the (authentic) body is not valid JSON or
 *   lacks the `event_id`/`event_type`/`event_body` envelope.
 */
export function constructEvent(
  rawBody: string | Uint8Array,
  signatureHeader: string | null | undefined,
  signingKey: string,
): KicbacEvent {
  if (typeof signingKey !== "string" || signingKey.length === 0) {
    throw new ValidationError(
      "Missing webhook signing key. Copy it from Settings > Webhooks in the gateway control panel.",
    );
  }
  if (signatureHeader === null || signatureHeader === undefined || signatureHeader.trim() === "") {
    throw new SignatureVerificationError(
      `Missing ${SIGNATURE_HEADER} header. Reject this request: it cannot be verified.`,
      { header: signatureHeader ?? null },
    );
  }
  if (signatureHeader.length > MAX_HEADER_LENGTH) {
    throw new SignatureVerificationError(
      `Oversized ${SIGNATURE_HEADER} header (${signatureHeader.length} chars). Reject this request.`,
      // Never store an attacker-sized header on the error object.
      { header: null },
    );
  }
  const match = SIGNATURE_RE.exec(signatureHeader.trim());
  if (!match) {
    throw new SignatureVerificationError(
      `Malformed ${SIGNATURE_HEADER} header: expected "t=<nonce>,s=<64 hex chars>". Reject this request.`,
      { header: signatureHeader },
    );
  }
  const nonce = match[1] as string;
  const signatureHex = match[2] as string;

  const bodyBytes =
    typeof rawBody === "string"
      ? Buffer.from(rawBody, "utf8")
      : Buffer.from(rawBody.buffer, rawBody.byteOffset, rawBody.byteLength);

  const expected = createHmac("sha256", signingKey)
    .update(Buffer.concat([Buffer.from(`${nonce}.`, "utf8"), bodyBytes]))
    .digest();
  const received = Buffer.from(signatureHex, "hex");
  // The regex guarantees 32 bytes, but guard anyway: timingSafeEqual throws
  // a RangeError on length mismatch, which must never escape this function.
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) {
    throw new SignatureVerificationError(
      "Webhook signature mismatch: the body was not signed with this signing key. Reject this request.",
      { header: signatureHeader },
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(bodyBytes.toString("utf8"));
  } catch (cause) {
    throw new WebhookParseError(
      "Webhook body is not valid JSON (the signature was valid, so this came from the gateway).",
      { cause },
    );
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new WebhookParseError("Webhook body is not a JSON object.");
  }
  const envelope = parsed as Record<string, unknown>;
  if (
    typeof envelope["event_id"] !== "string" ||
    typeof envelope["event_type"] !== "string" ||
    typeof envelope["event_body"] !== "object" ||
    envelope["event_body"] === null
  ) {
    throw new WebhookParseError(
      "Webhook JSON is missing the event_id/event_type/event_body envelope fields.",
    );
  }
  return parsed as KicbacEvent;
}

/**
 * Webhook helpers. This module never needs a gateway security key — the
 * webhook signing key (from Settings > Webhooks) is a separate secret passed
 * per call.
 */
export class Webhooks {
  /** See {@link constructEvent}. */
  constructEvent(
    rawBody: string | Uint8Array,
    signatureHeader: string | null | undefined,
    signingKey: string,
  ): KicbacEvent {
    return constructEvent(rawBody, signatureHeader, signingKey);
  }
}
