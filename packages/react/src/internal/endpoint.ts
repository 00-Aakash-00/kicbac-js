import { KicbacDeclineError, KicbacEndpointError } from "../errors.js";

/** Payload passed to `onSuccess` after the endpoint confirms the charge. */
export interface KicbacPaymentSuccess {
  transactionId: string;
  authCode?: string | null;
  amount?: string;
  /** The gateway's raw response, forwarded by the route handler. */
  raw?: unknown;
}

export interface PostTokenInput {
  endpoint: string;
  token: string;
  amount?: string | undefined;
  currency?: string | undefined;
  metadata?: Record<string, unknown> | undefined;
  signal?: AbortSignal | undefined;
  fetchImpl?: typeof fetch | undefined;
}

/**
 * POST a payment token to the merchant's charge endpoint (the contract
 * implemented by `createKicbacRouteHandler` in `@kicbac/nextjs`):
 *
 * - `200 {ok:true, transactionId, authCode?, amount, raw}` → success payload
 * - `402 {ok:false, code, message}` → `KicbacDeclineError` (recoverable —
 *   tokens are single-use, so resubmitting re-tokenizes)
 * - any other HTTP status → `KicbacEndpointError("endpoint_http")`
 * - network failure → `KicbacEndpointError("endpoint_network")`
 */
export async function postToken(input: PostTokenInput): Promise<KicbacPaymentSuccess> {
  const fetchImpl = input.fetchImpl ?? fetch;
  let response: Response;
  try {
    response = await fetchImpl(input.endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        token: input.token,
        ...(input.amount !== undefined ? { amount: input.amount } : {}),
        ...(input.currency !== undefined ? { currency: input.currency } : {}),
        ...(input.metadata !== undefined ? { metadata: input.metadata } : {}),
      }),
      ...(input.signal ? { signal: input.signal } : {}),
    });
  } catch (error) {
    if (input.signal?.aborted) throw error;
    throw new KicbacEndpointError(
      "endpoint_network",
      `Could not reach the payment endpoint (${input.endpoint}). Check your network ` +
        "connection and that the API route exists.",
    );
  }

  if (response.status === 402) {
    let body: unknown = null;
    try {
      body = await response.json();
    } catch {
      // fall through to the generic 402 error below
    }
    if (body && typeof body === "object" && (body as { ok?: unknown }).ok === false) {
      const declined = body as { code?: string | number; message?: string };
      throw new KicbacDeclineError(
        declined.code ?? "unknown",
        typeof declined.message === "string" ? declined.message : "The payment was declined.",
      );
    }
    throw new KicbacEndpointError(
      "endpoint_http",
      "The payment endpoint returned 402 with an unexpected body.",
      402,
    );
  }

  if (!response.ok) {
    throw new KicbacEndpointError(
      "endpoint_http",
      `The payment endpoint returned HTTP ${response.status}.`,
      response.status,
    );
  }

  let body: {
    transactionId?: unknown;
    authCode?: unknown;
    amount?: unknown;
    raw?: unknown;
  };
  try {
    body = (await response.json()) as typeof body;
  } catch {
    throw new KicbacEndpointError(
      "endpoint_http",
      "The payment endpoint returned a non-JSON success response.",
      response.status,
    );
  }
  return {
    transactionId: typeof body.transactionId === "string" ? body.transactionId : "",
    authCode: typeof body.authCode === "string" ? body.authCode : null,
    ...(typeof body.amount === "string" ? { amount: body.amount } : {}),
    raw: body.raw,
  };
}
