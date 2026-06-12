/**
 * Gateway code tables, inlined at build time from the shared fixtures in
 * `openapi/data/` (the published package has zero runtime dependencies and
 * does not read from disk). A parity test asserts these stay in sync with the
 * JSON files on disk.
 */
import responseCodesJson from "../../../openapi/data/response-codes.json";
import avsCodesJson from "../../../openapi/data/avs-codes.json";
import cvvCodesJson from "../../../openapi/data/cvv-codes.json";

export interface ResponseCodeEntry {
  /** Numeric gateway `response_code`, e.g. 100. */
  code: number;
  /** Canonical description from the Result Code Table. */
  text: string;
  /** Gateway `response` discriminant this code arrives with (1, 2, or 3). */
  response: 1 | 2 | 3;
  /** How the SDK surfaces it: typed result vs thrown error. */
  outcome: "approved" | "declined" | "error";
  /** For `outcome: "error"`, the unified-taxonomy class name that is thrown. */
  error_class?: string;
  note?: string;
}

interface ResponseCodesFile {
  codes: ResponseCodeEntry[];
  auth_failure_pattern: string;
}

const responseCodesFile = responseCodesJson as unknown as ResponseCodesFile;

/** The gateway Result Code Table (Kicbac-Direct-Post-API.pdf p. 52 + code 301). */
export const RESPONSE_CODES: readonly ResponseCodeEntry[] = responseCodesFile.codes;

/**
 * Case-insensitive pattern that distinguishes credential failures from other
 * `response_code=300` rejections (the gateway uses 300 for both).
 */
export const AUTH_FAILURE_PATTERN: RegExp = new RegExp(
  responseCodesFile.auth_failure_pattern,
  "i",
);

/** AVS response code descriptions, keyed by the 1-character `avsresponse`. */
export const AVS_CODES: Readonly<Record<string, string>> = (
  avsCodesJson as unknown as { codes: Record<string, string> }
).codes;

/** CVV response code descriptions, keyed by the 1-character `cvvresponse`. */
export const CVV_CODES: Readonly<Record<string, string>> = (
  cvvCodesJson as unknown as { codes: Record<string, string> }
).codes;
