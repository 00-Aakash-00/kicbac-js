/**
 * Maps an internal load-error code to consumer-safe panel copy.
 *
 * The shopper must NEVER see developer wording (env-var names, "Kicbac.js",
 * stack traces). Transient failures (the script was blocked or timed out) are
 * worth a "Try again"; configuration failures (missing/duplicate key) cannot be
 * fixed by the shopper, so they get a calm "try later" with no retry button.
 */
export interface LoadErrorCopy {
  title: string;
  message: string;
  /** Whether a shopper-facing retry could plausibly succeed. */
  retryable: boolean;
}

const TRANSIENT_CODES = new Set(["script_load_failed", "script_timeout", "collectjs_missing"]);

export function loadErrorCopy(code: string): LoadErrorCopy {
  if (TRANSIENT_CODES.has(code)) {
    return {
      title: "Couldn’t load payment",
      message: "Something interrupted our secure payment form. Check your connection and try again.",
      retryable: true,
    };
  }
  return {
    title: "Payment unavailable",
    message: "Payments are temporarily unavailable. Please try again in a little while.",
    retryable: false,
  };
}
