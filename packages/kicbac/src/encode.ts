/**
 * Form encoding for gateway requests. The gateway is a PHP form endpoint:
 * `URLSearchParams` serialization (spaces as `+`) is exactly what it expects.
 */

/** A bag of gateway params; `undefined`/`null` entries are skipped entirely. */
export type ParamBag = Record<string, string | undefined | null>;

/** Drop undefined/null entries and return the concrete string params. */
export function compactParams(params: ParamBag): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    out[key] = value;
  }
  return out;
}

/** Encode params as application/x-www-form-urlencoded (space -> `+`). */
export function encodeParams(params: Record<string, string>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    search.append(key, value);
  }
  return search.toString();
}
