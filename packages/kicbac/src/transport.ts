import {
  AuthenticationError,
  ConnectionError,
  GatewayError,
  HttpError,
  InvalidRequestError,
  KicbacError,
  ParseError,
  ProcessorError,
  RateLimitError,
  TimeoutError,
  ValidationError,
} from "./errors";
import { redactParams } from "./redact";
import { compactParams, encodeParams, type ParamBag } from "./encode";
import { decodeTransactResponse, emptyToNull, intOrNull } from "./decode";
import { AUTH_FAILURE_PATTERN } from "./codes";
import type { KicbacConfig, LogEntry, RequestOptions } from "./types/common";

export const DEFAULT_BASE_URL = "https://kicbac.transactiongateway.com";
const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_RETRIES = 2;
const TRANSACT_PATH = "/api/transact.php";
const QUERY_PATH = "/api/query.php";

/**
 * Failure codes that prove the request never left this machine (DNS lookup,
 * TCP connect, or connect-phase timeout failed before any bytes were sent).
 * Only these make a transact.php request safe to retry.
 */
const PRE_SEND_CODES = new Set([
  "ENOTFOUND",
  "EAI_AGAIN",
  "ECONNREFUSED",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "UND_ERR_CONNECT_TIMEOUT",
]);

/** TLS handshake failures — also provably pre-send. */
const TLS_CODE_RE = /^ERR_TLS_|CERT_|UNABLE_TO_(GET|VERIFY)/;

/** Walk an error's `cause`/`errors` tree collecting EVERY system error code. */
function collectErrorCodes(error: unknown, codes: string[] = [], depth = 0): string[] {
  if (depth > 6 || typeof error !== "object" || error === null) return codes;
  const candidate = error as { code?: unknown; cause?: unknown; errors?: unknown };
  if (typeof candidate.code === "string" && candidate.code.length > 0) codes.push(candidate.code);
  if (Array.isArray(candidate.errors)) {
    for (const sub of candidate.errors) collectErrorCodes(sub, codes, depth + 1);
  }
  collectErrorCodes(candidate.cause, codes, depth + 1);
  return codes;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * HTTP transport for the two gateway endpoints.
 *
 * DOUBLE-CHARGE INVARIANT: transact.php is NOT idempotent. A request is
 * re-sent only when the failure is provably pre-send (`sent: false`). Any
 * ambiguity (`sent: "unknown" | true`, timeouts, HTTP errors) surfaces to the
 * caller instead of risking a duplicate charge. query.php is read-only and
 * retried more aggressively.
 */
export class Transport {
  private readonly securityKey: string | undefined;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly fetchImpl: typeof globalThis.fetch | undefined;
  private readonly logger: ((entry: LogEntry) => void) | undefined;

  constructor(config: KicbacConfig) {
    this.securityKey =
      config.securityKey ??
      (typeof process !== "undefined" ? process.env?.["KICBAC_SECURITY_KEY"] : undefined);
    this.baseUrl = (config.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
    this.timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.maxRetries = config.maxRetries ?? DEFAULT_MAX_RETRIES;
    this.fetchImpl = config.fetch;
    this.logger = config.logger;
  }

  /**
   * POST to transact.php and decode the form-encoded response.
   * Returns the raw response record with `response` of "1" or "2";
   * `response=3` is mapped to the GatewayError taxonomy and thrown.
   */
  async transact(params: ParamBag, opts?: RequestOptions): Promise<Record<string, string>> {
    const concrete = this.withSecurityKey(params);
    const { text, contentType } = await this.request(TRANSACT_PATH, concrete, opts, false);
    const url = this.baseUrl + TRANSACT_PATH;
    let raw: Record<string, string>;
    try {
      raw = decodeTransactResponse(text, contentType);
    } catch (error) {
      throw this.withRequest(error, url, concrete);
    }
    if (raw["response"] === "3") {
      throw this.withRequest(this.gatewayError(raw), url, concrete);
    }
    return raw;
  }

  /** POST to query.php (idempotent) and return the raw XML body. */
  async query(params: ParamBag, opts?: RequestOptions): Promise<string> {
    const concrete = this.withSecurityKey(params);
    const { text } = await this.request(QUERY_PATH, concrete, opts, true);
    return text;
  }

  private withSecurityKey(params: ParamBag): Record<string, string> {
    const key = this.securityKey;
    if (key === undefined || key === "") {
      throw new ValidationError(
        "Missing security key. Pass { securityKey } to new Kicbac() or set KICBAC_SECURITY_KEY.",
      );
    }
    return compactParams({ ...params, security_key: key });
  }

  /** Attach pre-redacted request context. The ONLY place `request` is set. */
  private withRequest(error: unknown, url: string, params: Record<string, string>): unknown {
    if (KicbacError.isKicbacError(error)) {
      error.request = { url, params: redactParams(params) };
    }
    return error;
  }

  private log(entry: LogEntry): void {
    if (!this.logger) return;
    try {
      this.logger(entry);
    } catch {
      // A throwing logger must never alter a payment's outcome: by the time
      // some entries are emitted the gateway may already have processed the
      // charge, so propagating here could misreport success as failure.
    }
  }

  private async request(
    path: string,
    params: Record<string, string>,
    opts: RequestOptions | undefined,
    idempotent: boolean,
  ): Promise<{ text: string; contentType: string | null }> {
    const url = this.baseUrl + path;
    const redacted = redactParams(params);
    const body = encodeParams(params);

    for (let attempt = 0; ; attempt++) {
      this.log({ event: "request", url, attempt, params: redacted });
      try {
        return await this.sendOnce(url, params, body, opts, attempt);
      } catch (error) {
        const delayMs = this.retryDelayMs(error, idempotent, attempt);
        if (delayMs === null) throw error;
        this.log({
          event: "retry",
          url,
          attempt,
          delayMs,
          error: error instanceof Error ? error.name : String(error),
        });
        await sleep(delayMs);
      }
    }
  }

  /**
   * Decide whether `error` may be retried, and the backoff delay if so.
   * Full jitter: `random() * base * 2^attempt` (base 250ms; 1000ms for 429).
   */
  private retryDelayMs(error: unknown, idempotent: boolean, attempt: number): number | null {
    if (attempt >= this.maxRetries) return null;
    let base: number;
    if (error instanceof ConnectionError) {
      // transact.php: ONLY provably-pre-send failures are safe to re-send.
      if (!idempotent && error.sent !== false) return null;
      base = 250;
    } else if (error instanceof TimeoutError) {
      if (!idempotent) return null;
      base = 250;
    } else if (error instanceof HttpError) {
      if (!idempotent || ![502, 503, 504].includes(error.status)) return null;
      base = 250;
    } else if (error instanceof RateLimitError) {
      // HTTP 429 (system-wide) backs off on idempotent calls; the Payment-API
      // limit (response_code 301) is never auto-retried.
      if (!idempotent || error.httpStatus !== 429) return null;
      base = 1000;
    } else {
      // ParseError, GatewayError family, ValidationError, user abort reasons.
      return null;
    }
    return Math.random() * base * 2 ** attempt;
  }

  private async sendOnce(
    url: string,
    params: Record<string, string>,
    body: string,
    opts: RequestOptions | undefined,
    attempt: number,
  ): Promise<{ text: string; contentType: string | null }> {
    const userSignal = opts?.signal;
    // Pre-aborted: rethrow the user's reason untouched, before any I/O.
    if (userSignal?.aborted) throw userSignal.reason;

    const timeoutMs = opts?.timeoutMs ?? this.timeoutMs;
    const timeoutSignal = AbortSignal.timeout(timeoutMs);
    const signal = userSignal ? AbortSignal.any([userSignal, timeoutSignal]) : timeoutSignal;
    const fetchImpl = this.fetchImpl ?? globalThis.fetch;

    let response: Response;
    try {
      response = await fetchImpl(url, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body,
        signal,
      });
    } catch (error) {
      // User aborts win: rethrow the caller's reason untouched.
      if (userSignal?.aborted) throw userSignal.reason;
      if (timeoutSignal.aborted) {
        throw this.withRequest(
          new TimeoutError(
            `Request to the gateway timed out after ${timeoutMs}ms (per-attempt limit). The gateway may still have processed the request — query it before retrying a charge.`,
            { timeoutMs },
          ),
          url,
          params,
        );
      }
      throw this.withRequest(this.connectionError(error), url, params);
    }

    let text: string;
    try {
      text = await response.text();
    } catch (error) {
      if (userSignal?.aborted) throw userSignal.reason;
      if (timeoutSignal.aborted) {
        throw this.withRequest(
          new TimeoutError(
            `Request to the gateway timed out after ${timeoutMs}ms while reading the response. The request WAS sent — query the gateway before retrying a charge.`,
            { timeoutMs },
          ),
          url,
          params,
        );
      }
      throw this.withRequest(
        new ConnectionError(
          "The gateway response body could not be read. The request WAS sent and may have been processed — query the gateway before retrying a charge.",
          { sent: true, cause: error },
        ),
        url,
        params,
      );
    }

    this.log({ event: "response", url, attempt, status: response.status });

    if (response.status === 429) {
      throw this.withRequest(
        new RateLimitError(
          "System-wide rate limit exceeded (HTTP 429). Reduce concurrent connections and wait before retrying.",
          { httpStatus: 429, responseCode: null },
        ),
        url,
        params,
      );
    }
    if (response.status !== 200) {
      throw this.withRequest(
        new HttpError(
          `Unexpected HTTP ${response.status} from the gateway (it normally always returns 200).`,
          { status: response.status, bodySnippet: text.slice(0, 200) },
        ),
        url,
        params,
      );
    }
    return { text, contentType: response.headers.get("content-type") };
  }

  /** Classify a fetch rejection into a ConnectionError with the right `sent`. */
  private connectionError(error: unknown): ConnectionError {
    const codes = collectErrorCodes(error);
    // Pre-send is only provable when EVERY observed failure code is pre-send.
    // Happy-eyeballs (and other multi-attempt paths) surface AggregateErrors
    // with one code per connection attempt; a single post-connect code in the
    // tree (e.g. ECONNRESET, ETIMEDOUT) means some attempt may have
    // transmitted the request, so the safe classification is "unknown".
    const preSend =
      codes.length > 0 && codes.every((c) => PRE_SEND_CODES.has(c) || TLS_CODE_RE.test(c));
    const code = codes[0];
    if (preSend) {
      return new ConnectionError(
        `Could not connect to the gateway (${code}). The request was never sent; it is safe to retry.`,
        { sent: false, cause: error },
      );
    }
    return new ConnectionError(
      `Connection to the gateway failed${code ? ` (${code})` : ""}. It is unknown whether the request was processed — query the gateway before retrying a charge.`,
      { sent: "unknown", cause: error },
    );
  }

  /** Map a `response=3` record to the GatewayError taxonomy. */
  private gatewayError(raw: Record<string, string>): KicbacError {
    const responseCode = intOrNull(raw["response_code"]);
    const responseText = raw["responsetext"] ?? "";
    if (responseCode === 301) {
      return new RateLimitError(
        "Payment API rate limit exceeded (response_code 301). Do not retry immediately — retrying increases the delay before transactions are allowed again.",
        { httpStatus: 200, responseCode: 301 },
      );
    }
    const details = {
      responseCode,
      responseText,
      transactionId: emptyToNull(raw["transactionid"]),
      raw,
    };
    if (responseCode === 300) {
      if (AUTH_FAILURE_PATTERN.test(responseText)) {
        return new AuthenticationError(
          `Gateway authentication failed: ${responseText}. Check your security key (Settings > Security Keys in the control panel).`,
          details,
        );
      }
      return new InvalidRequestError(
        `The gateway rejected the request (response_code 300): ${responseText}.`,
        details,
      );
    }
    if (responseCode !== null && responseCode >= 400 && responseCode <= 461) {
      return new ProcessorError(
        `The processor returned an error (response_code ${responseCode}): ${responseText}.`,
        details,
      );
    }
    return new GatewayError(
      `The gateway returned an error (response_code ${responseCode ?? "unknown"}): ${responseText}.`,
      details,
    );
  }
}
