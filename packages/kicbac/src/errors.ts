import { redactParams } from "./redact";

/**
 * Brand used to recognize SDK errors across module duplication (dual-package
 * hazard: the ESM and CJS builds each have their own class identities, so
 * `instanceof` alone is unreliable). `Symbol.for` ensures one shared symbol.
 */
const BRAND = Symbol.for("kicbac.error");

/** Request context attached by the transport. Params are ALWAYS pre-redacted. */
export interface RedactedRequest {
  url: string;
  params: Record<string, string>;
}

/**
 * Base class for every error thrown by the SDK. Never thrown directly —
 * always one of the concrete subclasses. Discriminate with the stable string
 * `code` tag or `KicbacError.isKicbacError()`.
 */
export class KicbacError extends Error {
  /** Stable machine-readable tag, e.g. `"kicbac_timeout"`. */
  readonly code: string = "kicbac_error";
  override readonly name: string = "KicbacError";
  /** Redacted request context, attached by the transport when available. */
  request?: RedactedRequest;

  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    Object.defineProperty(this, BRAND, { value: true, enumerable: false });
  }

  /** Cross-realm/dual-package-safe check for SDK errors. */
  static isKicbacError(value: unknown): value is KicbacError {
    return (
      typeof value === "object" &&
      value !== null &&
      (value as Record<PropertyKey, unknown>)[BRAND] === true
    );
  }

  /** JSON-safe, redaction-safe representation (request params are pre-redacted). */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      ...(this.request ? { request: this.request } : {}),
    };
  }
}

/** Invalid input detected before any network request was made. */
export class ValidationError extends KicbacError {
  override readonly code: string = "kicbac_validation";
  override readonly name: string = "ValidationError";
}

/** Base for all failures of an attempted API call. Never thrown directly. */
export class APIError extends KicbacError {
  override readonly code: string = "kicbac_api";
  override readonly name: string = "APIError";
}

/**
 * The HTTP request failed at the network level.
 *
 * `sent` is the double-charge discriminant:
 * - `false`  — provably failed before the request left this machine
 *              (DNS/connect/TLS failure); safe to retry.
 * - `"unknown"` — the connection broke mid-flight; the gateway MAY have
 *              processed the request. Never auto-retried for transact.php.
 * - `true`   — the request was sent and the response body could not be read;
 *              the gateway almost certainly processed it. Never auto-retried
 *              for transact.php.
 */
export class ConnectionError extends APIError {
  override readonly code: string = "kicbac_connection";
  override readonly name: string = "ConnectionError";
  readonly sent: boolean | "unknown";

  constructor(message: string, options: { sent: boolean | "unknown"; cause?: unknown }) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.sent = options.sent;
  }

  override toJSON(): Record<string, unknown> {
    return { ...super.toJSON(), sent: this.sent };
  }
}

/** The SDK's per-attempt timer elapsed before the gateway responded. */
export class TimeoutError extends APIError {
  override readonly code: string = "kicbac_timeout";
  override readonly name: string = "TimeoutError";
  readonly timeoutMs: number;

  constructor(message: string, options: { timeoutMs: number }) {
    super(message);
    this.timeoutMs = options.timeoutMs;
  }

  override toJSON(): Record<string, unknown> {
    return { ...super.toJSON(), timeoutMs: this.timeoutMs };
  }
}

/** The gateway returned an unexpected HTTP status (it normally always returns 200). */
export class HttpError extends APIError {
  override readonly code: string = "kicbac_http";
  override readonly name: string = "HttpError";
  readonly status: number;
  readonly bodySnippet: string;

  constructor(message: string, options: { status: number; bodySnippet: string }) {
    super(message);
    this.status = options.status;
    this.bodySnippet = options.bodySnippet;
  }

  override toJSON(): Record<string, unknown> {
    return { ...super.toJSON(), status: this.status, bodySnippet: this.bodySnippet };
  }
}

/** The response body could not be parsed (form-encoded or XML). Never retried. */
export class ParseError extends APIError {
  override readonly code: string = "kicbac_parse";
  override readonly name: string = "ParseError";
  readonly bodySnippet: string;
  readonly contentType: string | null;

  constructor(
    message: string,
    options: { bodySnippet: string; contentType: string | null; cause?: unknown },
  ) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.bodySnippet = options.bodySnippet;
    this.contentType = options.contentType;
  }

  override toJSON(): Record<string, unknown> {
    return { ...super.toJSON(), bodySnippet: this.bodySnippet, contentType: this.contentType };
  }
}

/**
 * Rate limited. Two distinct shapes:
 * - system-wide: HTTP 429 (`httpStatus: 429`, `responseCode: null`)
 * - Payment-API: HTTP 200 with `response=3&response_code=301`
 *   (`httpStatus: 200`, `responseCode: 301`) — never auto-retried.
 */
export class RateLimitError extends APIError {
  override readonly code: string = "kicbac_rate_limit";
  override readonly name: string = "RateLimitError";
  readonly httpStatus: 200 | 429;
  readonly responseCode: 301 | null;

  constructor(message: string, options: { httpStatus: 200 | 429; responseCode: 301 | null }) {
    super(message);
    this.httpStatus = options.httpStatus;
    this.responseCode = options.responseCode;
  }

  override toJSON(): Record<string, unknown> {
    return { ...super.toJSON(), httpStatus: this.httpStatus, responseCode: this.responseCode };
  }
}

/** The gateway returned `response=3` (an error, distinct from a decline). */
export class GatewayError extends APIError {
  override readonly code: string = "kicbac_gateway";
  override readonly name: string = "GatewayError";
  readonly responseCode: number | null;
  readonly responseText: string;
  readonly transactionId: string | null;
  readonly raw: Record<string, string>;

  constructor(
    message: string,
    options: {
      responseCode: number | null;
      responseText: string;
      transactionId: string | null;
      raw: Record<string, string>;
    },
  ) {
    super(message);
    this.responseCode = options.responseCode;
    this.responseText = options.responseText;
    this.transactionId = options.transactionId;
    this.raw = options.raw;
  }

  override toJSON(): Record<string, unknown> {
    return {
      ...super.toJSON(),
      responseCode: this.responseCode,
      responseText: this.responseText,
      transactionId: this.transactionId,
      raw: redactParams(this.raw),
    };
  }
}

/** `response_code=300` whose response text matches the gateway's auth-failure wording. */
export class AuthenticationError extends GatewayError {
  override readonly code: string = "kicbac_authentication";
  override readonly name: string = "AuthenticationError";
}

/** `response_code=300` for anything else the gateway rejected pre-processor. */
export class InvalidRequestError extends GatewayError {
  override readonly code: string = "kicbac_invalid_request";
  override readonly name: string = "InvalidRequestError";
}

/** `response_code` 400–461: the processor reported an error. */
export class ProcessorError extends GatewayError {
  override readonly code: string = "kicbac_processor";
  override readonly name: string = "ProcessorError";
}

/** Webhook signature missing, malformed, or failed constant-time verification. */
export class SignatureVerificationError extends KicbacError {
  override readonly code: string = "kicbac_signature_verification";
  override readonly name: string = "SignatureVerificationError";
  readonly header: string | null;

  constructor(message: string, options: { header: string | null }) {
    super(message);
    this.header = options.header;
  }

  override toJSON(): Record<string, unknown> {
    return { ...super.toJSON(), header: this.header };
  }
}

/** Webhook body failed JSON parsing or envelope validation AFTER a valid signature. */
export class WebhookParseError extends KicbacError {
  override readonly code: string = "kicbac_webhook_parse";
  override readonly name: string = "WebhookParseError";
}
