/** Configuration for the {@link ../client.Kicbac} client. */
export interface KicbacConfig {
  /**
   * Gateway API security key. Defaults to `process.env.KICBAC_SECURITY_KEY`.
   * A missing key throws a ValidationError at call time, not construct time.
   */
  securityKey?: string;
  /** Gateway origin. Default: `https://kicbac.transactiongateway.com`. */
  baseUrl?: string;
  /** Per-attempt timeout in milliseconds. Default: 30000. */
  timeoutMs?: number;
  /** Custom fetch implementation (must be WHATWG-compatible). */
  fetch?: typeof globalThis.fetch;
  /**
   * Maximum number of automatic retry attempts on top of the first attempt.
   * Default: 2. Retries NEVER re-send a transact.php request unless the
   * failure provably happened before the request left this machine.
   */
  maxRetries?: number;
  /** Structured log hook. Entries are pre-redacted (PCI-safe). */
  logger?: (entry: LogEntry) => void;
}

/** Per-call options accepted by every API method. */
export interface RequestOptions {
  /** Abort the call. Your abort reason is rethrown untouched. */
  signal?: AbortSignal;
  /** Override the per-attempt timeout for this call only. */
  timeoutMs?: number;
}

/** Structured, pre-redacted log entry emitted via `config.logger`. */
export interface LogEntry {
  event: "request" | "response" | "retry";
  /** Full endpoint URL. */
  url: string;
  /** 0-based attempt counter (0 = first attempt). */
  attempt: number;
  /** Redacted request params (on `request` entries). */
  params?: Record<string, string>;
  /** HTTP status (on `response` entries). */
  status?: number;
  /** Planned backoff before the next attempt (on `retry` entries). */
  delayMs?: number;
  /** Error class name that triggered the retry (on `retry` entries). */
  error?: string;
}

/**
 * Monetary amount as a string, e.g. `"49.99"` — 1–8 integer digits with an
 * optional 1–2 digit decimal part. Numbers are rejected (floating point is
 * unsafe for money).
 */
export type Money = string;

/** Billing address/contact fields. */
export interface BillingAddress {
  firstName?: string;
  lastName?: string;
  company?: string;
  address1?: string;
  address2?: string;
  city?: string;
  /** Two-character state/province code. */
  state?: string;
  zip?: string;
  /** ISO 3166 two-character country code. */
  country?: string;
  phone?: string;
  fax?: string;
  email?: string;
}

/**
 * Shipping address fields. `phone`/`fax` are only transmitted for Customer
 * Vault operations (the transaction API has no shipping phone/fax variables).
 */
export interface ShippingAddress {
  firstName?: string;
  lastName?: string;
  company?: string;
  address1?: string;
  address2?: string;
  city?: string;
  state?: string;
  zip?: string;
  country?: string;
  email?: string;
  phone?: string;
  fax?: string;
}

/** Keyed manual card entry. Prefer Collect.js payment tokens in production. */
export interface CardDetails {
  /** Card number (PAN). Never logged; redacted everywhere. */
  number: string;
  /** Expiration in MMYY format, e.g. `"1029"`. */
  expiry: string;
  /** Card security code. Strongly recommended. */
  cvv?: string;
}

/** ACH / electronic check details. */
export interface CheckDetails {
  /** Name on the account. */
  name: string;
  /** Bank routing number. */
  routing: string;
  /** Bank account number. Never logged; redacted everywhere. */
  account: string;
  accountHolderType?: "business" | "personal";
  accountType?: "checking" | "savings";
  secCode?: "PPD" | "WEB" | "TEL" | "CCD";
}

/** Result of an approved gateway action (`response=1`). */
export interface ApprovedTransaction {
  ok: true;
  /** Gateway transaction id. */
  transactionId: string;
  authCode: string | null;
  /** Numeric result code (100 = approved). */
  responseCode: number;
  responseText: string;
  avsResponse: string | null;
  cvvResponse: string | null;
  orderId: string | null;
  customerVaultId: string | null;
  partialPaymentId: string | null;
  partialPaymentBalance: string | null;
  amountAuthorized: string | null;
  /** Every response field verbatim (empty strings preserved). */
  raw: Record<string, string>;
}

/** Result of a declined gateway action (`response=2`). Never thrown. */
export interface DeclinedTransaction {
  ok: false;
  /** Numeric decline code (2xx). */
  code: number;
  /** Gateway response text, e.g. `"DECLINE"`. */
  message: string;
  transactionId: string | null;
  avsResponse: string | null;
  cvvResponse: string | null;
  orderId: string | null;
  /** Every response field verbatim (empty strings preserved). */
  raw: Record<string, string>;
}

/** Discriminated union for every charge-like call: check `result.ok`. */
export type TransactionResult = ApprovedTransaction | DeclinedTransaction;
