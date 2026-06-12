import type { KicbacFieldName } from "@kicbac/js";

/** Thrown by the endpoint helper when the server returns `402 {ok:false}`. */
export class KicbacDeclineError extends Error {
  override readonly name: string = "KicbacDeclineError";
  /** Gateway response code (e.g. 200 for a generic decline). */
  readonly responseCode: string | number;
  /** Gateway response text (e.g. "DECLINE"). */
  readonly responseText: string;

  constructor(responseCode: string | number, responseText: string) {
    super(responseText || "The payment was declined.");
    this.responseCode = responseCode;
    this.responseText = responseText;
  }
}

/** Thrown by the endpoint helper for network failures and non-402 HTTP errors. */
export class KicbacEndpointError extends Error {
  override readonly name: string = "KicbacEndpointError";
  readonly code: "endpoint_http" | "endpoint_network";
  readonly status: number | undefined;

  constructor(code: "endpoint_http" | "endpoint_network", message: string, status?: number) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

/** Discriminated union surfaced as `usePaymentForm().error`. */
export type KicbacFormError =
  | { type: "load"; code: string; message: string }
  | { type: "validation"; message: string; fields: KicbacFieldName[] }
  | { type: "tokenization"; code: string; message: string }
  | { type: "endpoint"; code: "endpoint_http" | "endpoint_network"; message: string; status?: number }
  | { type: "decline"; code: string | number; message: string; responseText: string };
