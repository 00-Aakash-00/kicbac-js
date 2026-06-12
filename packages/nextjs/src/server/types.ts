/**
 * Structural types for the `kicbac` server SDK. The route handler types
 * against these narrow interfaces (and lazily imports the real package at
 * request time), so `@kicbac/nextjs` compiles and tests independently of the
 * `kicbac` package build.
 */

export interface KicbacSaleOk {
  ok: true;
  transactionId: string;
  authCode?: string | null;
  raw?: unknown;
}

export interface KicbacSaleDeclined {
  ok: false;
  /** Gateway response code (e.g. 200 = generic decline). */
  code: string | number;
  /** Gateway response text (e.g. "DECLINE"). */
  message: string;
  raw?: unknown;
}

export type KicbacSaleResult = KicbacSaleOk | KicbacSaleDeclined;

/** The slice of the `kicbac` client the route handler needs. */
export interface KicbacServerClient {
  transactions: {
    sale(
      params: { amount: string; paymentToken: string } & Record<string, unknown>,
    ): Promise<KicbacSaleResult>;
  };
}

/**
 * A verified webhook event. The envelope mirrors the gateway payload
 * (snake_case) exactly as the `kicbac` SDK's `constructEvent` returns it.
 */
export interface KicbacWebhookEvent {
  event_id: string;
  event_type: string;
  event_body: Record<string, unknown>;
}
