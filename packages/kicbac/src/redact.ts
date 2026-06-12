/**
 * Redaction of sensitive gateway parameters. Applied at the transport's single
 * error-construction site, on every logger() call, and in error toJSON().
 * Never log or persist raw gateway params without passing them through here.
 */

/** Gateway parameter names (case-insensitive) that must never be logged verbatim. */
export const REDACT_KEYS: readonly string[] = [
  "security_key",
  "ccnumber",
  "cc_number",
  "cvv",
  "checkaba",
  "check_aba",
  "checkaccount",
  "check_account",
  "payment_token",
  "googlepay_payment_data",
  "applepay_payment_data",
  "cavv",
  "xid",
  "signature_image",
  "social_security_number",
  "drivers_license_number",
  "password",
];

const PAN_KEYS = new Set(["ccnumber", "cc_number"]);
const REDACT_SET = new Set(REDACT_KEYS);

const REDACTED = "[REDACTED]";

/** Mask a PAN to its last 4 digits, e.g. "4111111111111111" -> "****1111". */
function maskPan(value: string): string {
  if (value.length <= 4) return "****";
  return `****${value.slice(-4)}`;
}

/** Redact a single key/value pair. Returns the value unchanged if not sensitive. */
export function redactValue(key: string, value: string): string {
  const lower = key.toLowerCase();
  if (PAN_KEYS.has(lower)) return maskPan(value);
  if (REDACT_SET.has(lower)) return REDACTED;
  return value;
}

/** Return a copy of `params` with all sensitive values redacted. */
export function redactParams(params: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(params)) {
    out[key] = redactValue(key, value);
  }
  return out;
}
