import { ParseError } from "./errors";

/**
 * Decode a transact.php response body (form-encoded, served as text/html).
 * Throws ParseError when the body is empty or `response` is not 1/2/3 —
 * e.g. an HTML error page or truncated body.
 */
export function decodeTransactResponse(
  body: string,
  contentType: string | null,
): Record<string, string> {
  const snippet = body.slice(0, 200);
  if (body.trim() === "") {
    throw new ParseError(
      "Empty response body from transact.php. The gateway always returns a form-encoded body; this response cannot be interpreted.",
      { bodySnippet: snippet, contentType },
    );
  }
  const raw: Record<string, string> = {};
  for (const [key, value] of new URLSearchParams(body)) {
    raw[key] = value;
  }
  const response = raw["response"];
  if (response !== "1" && response !== "2" && response !== "3") {
    throw new ParseError(
      'Could not parse transact.php response: missing or invalid "response" field (expected 1, 2, or 3). The gateway may have returned an error page.',
      { bodySnippet: snippet, contentType },
    );
  }
  return raw;
}

/** Normalize the gateway's empty-string-means-absent convention to null. */
export function emptyToNull(value: string | undefined): string | null {
  return value === undefined || value === "" ? null : value;
}

/** Parse an integer response field; null when absent or non-numeric. */
export function intOrNull(value: string | undefined): number | null {
  if (value === undefined || value === "") return null;
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? n : null;
}
