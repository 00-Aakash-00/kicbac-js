/** Error codes thrown while loading the Kicbac.js script. */
export type KicbacLoadErrorCode =
  | "missing_key"
  | "key_mismatch"
  | "script_load_failed"
  | "script_timeout"
  | "collectjs_missing";

/** Error codes thrown while tokenizing. */
export type KicbacTokenizationErrorCode = "tokenization_timeout" | "cancelled";

/** Base error for everything thrown by `@kicbac/js`. */
export class KicbacError extends Error {
  override readonly name: string = "KicbacError";
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

/** Thrown when the Kicbac.js script cannot be loaded or initialized. */
export class KicbacLoadError extends KicbacError {
  override readonly name: string = "KicbacLoadError";
  declare readonly code: KicbacLoadErrorCode;

  constructor(code: KicbacLoadErrorCode, message: string) {
    super(code, message);
  }
}

/** Thrown when `tokenize()` times out or is cancelled by `destroy()`. */
export class KicbacTokenizationError extends KicbacError {
  override readonly name: string = "KicbacTokenizationError";
  declare readonly code: KicbacTokenizationErrorCode;

  constructor(code: KicbacTokenizationErrorCode, message: string) {
    super(code, message);
  }
}
