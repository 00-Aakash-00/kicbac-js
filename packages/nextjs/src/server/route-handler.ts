import type { KicbacServerClient } from "./types.js";

/** Validated request body the payment form POSTs (`@kicbac/react` postToken). */
export interface KicbacChargeBody {
  token: string;
  amount?: string;
  currency?: string;
  metadata?: Record<string, unknown>;
}

export interface KicbacRouteHandlerContext {
  body: KicbacChargeBody;
  request: Request;
}

export interface CreateKicbacRouteHandlerOptions {
  /** Fixed server-side amount — the client-submitted amount is ignored. */
  amount?: string;
  /** Compute the amount server-side per request (e.g. from a cart lookup). */
  amountResolver?: (context: KicbacRouteHandlerContext) => string | Promise<string>;
  /**
   * DANGER: charge whatever amount the browser submits. Only for prototypes —
   * anyone can POST any amount to this endpoint.
   */
  allowInsecureClientAmount?: boolean;
  /** Inject a preconfigured client (otherwise `new Kicbac()` lazily at first request). */
  client?: KicbacServerClient;
  /** Passed to `new Kicbac({ securityKey })`; defaults to `KICBAC_SECURITY_KEY` via the SDK. */
  securityKey?: string;
  /** Extra gateway sale params merged into the request (order ids, billing, CIT/MIT…). */
  saleParams?: (
    context: KicbacRouteHandlerContext,
  ) => Record<string, unknown> | Promise<Record<string, unknown>>;
  /** Server-side error sink — 500 responses are redacted; details only go here. */
  onError?: (error: unknown) => void;
}

const AMOUNT_PATTERN = /^\d{1,8}(\.\d{1,2})?$/;
const GATEWAY_ERROR_NAMES = new Set([
  "GatewayError",
  "AuthenticationError",
  "InvalidRequestError",
  "ProcessorError",
]);
/** Maximum charge-request body size (bytes) — a charge body is tiny. */
const MAX_BODY_BYTES = 64 * 1024;
/**
 * Sale params `saleParams` may NEVER set — the server owns these. They are
 * stripped from the callback's return before it reaches the SDK so a misused
 * (or attacker-influenced) callback cannot override the charged amount, swap
 * the token, change the transaction type, or inject credentials.
 */
const RESERVED_SALE_KEYS = new Set([
  "amount",
  "paymentToken",
  "payment_token",
  "securityKey",
  "security_key",
  "type",
  "ccnumber",
  "cvv",
]);

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function invalidRequest(message: string): Response {
  return json(400, { ok: false, code: "invalid_request", message });
}

function serverError(): Response {
  return json(500, {
    ok: false,
    code: "server_error",
    message: "Payment processing failed. Check the server logs.",
  });
}

/** PAN-shaped: 13–19 digits once spaces/dashes are stripped. */
function looksLikeCardNumber(token: string): boolean {
  return /^\d{13,19}$/.test(token.replace(/[\s-]/g, ""));
}

function isGatewayErrorLike(
  error: unknown,
): error is Error & { responseCode?: string | number; responseText?: string } {
  return error instanceof Error && GATEWAY_ERROR_NAMES.has(error.name);
}

/** Drop server-owned keys (and any `__proto__`/prototype pollution) from saleParams output. */
function stripReservedKeys(
  params: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (!params) return undefined;
  const safe: Record<string, unknown> = {};
  for (const key of Object.keys(params)) {
    if (RESERVED_SALE_KEYS.has(key) || key === "__proto__" || key === "constructor") continue;
    safe[key] = params[key];
  }
  return safe;
}

/**
 * One-line charge endpoint for `app/api/kicbac/route.ts`:
 *
 * ```ts
 * import { createKicbacRouteHandler } from "@kicbac/nextjs/server";
 * export const { POST } = createKicbacRouteHandler({ amount: "49.99" });
 * ```
 *
 * Throws synchronously unless EXACTLY ONE amount strategy is configured —
 * the amount is always decided on the server because client totals cannot
 * be trusted.
 */
export function createKicbacRouteHandler(options: CreateKicbacRouteHandlerOptions): {
  POST: (request: Request) => Promise<Response>;
} {
  const strategies = [
    options.amount !== undefined,
    options.amountResolver !== undefined,
    options.allowInsecureClientAmount === true,
  ].filter(Boolean).length;
  if (strategies !== 1) {
    throw new Error(
      "createKicbacRouteHandler: configure exactly ONE amount strategy — `amount` " +
        "(fixed), `amountResolver` (computed server-side), or `allowInsecureClientAmount: " +
        "true` (prototypes only). Kicbac refuses to trust client-submitted totals: anyone " +
        "can POST any amount to this endpoint.",
    );
  }
  if (options.amount !== undefined && !AMOUNT_PATTERN.test(options.amount)) {
    throw new Error(
      `createKicbacRouteHandler: invalid amount "${options.amount}" — use a decimal string like "49.99".`,
    );
  }

  // Lazy client init: the `kicbac` package is only imported at first request.
  let clientPromise: Promise<KicbacServerClient> | null = null;
  const getClient = (): Promise<KicbacServerClient> => {
    if (options.client) return Promise.resolve(options.client);
    clientPromise ??= import("kicbac").then((mod) => {
      const Kicbac = (mod as { default: new (config?: { securityKey?: string }) => unknown })
        .default;
      return new Kicbac(
        options.securityKey !== undefined ? { securityKey: options.securityKey } : undefined,
      ) as KicbacServerClient;
    });
    return clientPromise;
  };

  const POST = async (request: Request): Promise<Response> => {
    // Cheap DoS guard: reject oversized bodies before parsing. Trust the
    // declared length when present, then cap the actual bytes read.
    const declaredLength = Number(request.headers.get("content-length"));
    if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
      return invalidRequest("Request body too large.");
    }
    let parsed: unknown;
    try {
      const buffer = await request.arrayBuffer();
      if (buffer.byteLength > MAX_BODY_BYTES) {
        return invalidRequest("Request body too large.");
      }
      parsed = JSON.parse(new TextDecoder().decode(buffer));
    } catch {
      return invalidRequest("The request body must be JSON.");
    }
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      return invalidRequest("The request body must be a JSON object.");
    }
    const raw = parsed as Record<string, unknown>;

    const token = raw["token"];
    if (typeof token !== "string" || token.length === 0) {
      return invalidRequest(
        "Missing payment token. POST { token } from the Kicbac payment form (Collect.js).",
      );
    }
    // Never accept (or echo) anything that looks like a raw card number.
    if (looksLikeCardNumber(token)) {
      return invalidRequest(
        "The submitted token looks like a raw card number. Raw card data must never " +
          "reach your server — tokenize in the browser with the Kicbac payment form " +
          "(Collect.js) and send the resulting payment token.",
      );
    }

    const body: KicbacChargeBody = {
      token,
      ...(typeof raw["amount"] === "string" ? { amount: raw["amount"] } : {}),
      ...(typeof raw["currency"] === "string" ? { currency: raw["currency"] } : {}),
      ...(raw["metadata"] !== null &&
      typeof raw["metadata"] === "object" &&
      !Array.isArray(raw["metadata"])
        ? { metadata: raw["metadata"] as Record<string, unknown> }
        : {}),
    };
    const context: KicbacRouteHandlerContext = { body, request };

    let amount: string;
    if (options.amount !== undefined) {
      // Fixed server amount: whatever the client sent is ignored.
      amount = options.amount;
    } else if (options.amountResolver) {
      try {
        amount = await options.amountResolver(context);
      } catch (error) {
        options.onError?.(error);
        return serverError();
      }
      if (typeof amount !== "string" || !AMOUNT_PATTERN.test(amount)) {
        options.onError?.(
          new Error(`amountResolver returned an invalid amount: ${String(amount)}`),
        );
        return serverError();
      }
    } else {
      if (body.amount === undefined || !AMOUNT_PATTERN.test(body.amount)) {
        return invalidRequest(
          'allowInsecureClientAmount requires a decimal string `amount` (e.g. "49.99") in the request body.',
        );
      }
      amount = body.amount;
    }

    try {
      const client = await getClient();
      const extraParams = options.saleParams ? await options.saleParams(context) : undefined;
      // Spread extras FIRST, then set server-owned fields LAST so a misused or
      // attacker-influenced saleParams can never override the charged amount,
      // swap the token, or change the transaction type. Reserved keys are also
      // stripped defensively so they cannot reach the SDK via snake_case.
      const safeExtras = stripReservedKeys(extraParams);
      const result = await client.transactions.sale({
        ...safeExtras,
        amount,
        paymentToken: token,
      });

      if (result.ok) {
        return json(200, {
          ok: true,
          transactionId: result.transactionId,
          authCode: result.authCode ?? null,
          amount,
          raw: result.raw ?? null,
        });
      }
      // Declines are typed results from the SDK — surface them as 402, never 200.
      return json(402, { ok: false, code: result.code, message: result.message });
    } catch (error) {
      // Thrown GatewayError family (auth/validation/processor) also maps to
      // 402 with its gateway response code.
      if (isGatewayErrorLike(error)) {
        return json(402, {
          ok: false,
          code: error.responseCode ?? "gateway_error",
          message: error.responseText ?? error.message,
        });
      }
      options.onError?.(error);
      return serverError();
    }
  };

  return { POST };
}
