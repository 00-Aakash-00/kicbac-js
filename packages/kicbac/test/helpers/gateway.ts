import { http, HttpResponse, type DefaultBodyType, type StrictResponse } from "msw";
import { setupServer } from "msw/node";

type GatewayServer = ReturnType<typeof setupServer>;

export const GATEWAY_ORIGIN = "https://kicbac.transactiongateway.com";
export const TEST_KEY = "test_security_key_123";

export interface GatewayReply {
  body: string;
  status?: number;
  contentType?: string;
  delayMs?: number;
}

type Responder = string | GatewayReply | ((params: URLSearchParams) => string | GatewayReply);

export interface GatewayMock {
  server: GatewayServer;
  /** Recorded transact.php request bodies, in order. */
  transactRequests: URLSearchParams[];
  /** Recorded query.php request bodies, in order. */
  queryRequests: URLSearchParams[];
  /** Queue a one-shot transact.php response (FIFO). */
  onTransact(responder: Responder): void;
  /** Set the fallback transact.php response used when the queue is empty. */
  transactDefault(responder: Responder | null): void;
  /** Queue a one-shot query.php response (FIFO). */
  onQuery(responder: Responder): void;
  /** Set the fallback query.php response used when the queue is empty. */
  queryDefault(responder: Responder | null): void;
  /** Clear recorded requests + queues (call from afterEach). */
  reset(): void;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Form-encode a record exactly like the gateway does (text/html body). */
export function formBody(fields: Record<string, string>): string {
  return new URLSearchParams(fields).toString();
}

/** A canonical approved transact.php response body. */
export function approvedBody(overrides: Record<string, string> = {}): string {
  return formBody({
    response: "1",
    responsetext: "SUCCESS",
    authcode: "123456",
    transactionid: "1234567890",
    avsresponse: "N",
    cvvresponse: "M",
    orderid: "",
    type: "sale",
    response_code: "100",
    ...overrides,
  });
}

/** A canonical declined transact.php response body. */
export function declinedBody(overrides: Record<string, string> = {}): string {
  return formBody({
    response: "2",
    responsetext: "DECLINE",
    authcode: "",
    transactionid: "1234567891",
    avsresponse: "N",
    cvvresponse: "",
    orderid: "",
    type: "sale",
    response_code: "200",
    ...overrides,
  });
}

/** A canonical error (response=3) transact.php response body. */
export function errorBody(overrides: Record<string, string> = {}): string {
  return formBody({
    response: "3",
    responsetext: "Transaction was rejected by gateway.",
    authcode: "",
    transactionid: "",
    avsresponse: "",
    cvvresponse: "",
    orderid: "",
    type: "sale",
    response_code: "300",
    ...overrides,
  });
}

export function createGateway(): GatewayMock {
  const transactRequests: URLSearchParams[] = [];
  const queryRequests: URLSearchParams[] = [];
  const transactQueue: Responder[] = [];
  const queryQueue: Responder[] = [];
  let transactFallback: Responder | null = null;
  let queryFallback: Responder | null = null;

  async function respond(
    requests: URLSearchParams[],
    queue: Responder[],
    fallback: Responder | null,
    request: Request,
    endpoint: string,
  ): Promise<StrictResponse<DefaultBodyType>> {
    const params = new URLSearchParams(await request.text());
    requests.push(params);
    const responder = queue.shift() ?? fallback;
    if (!responder) {
      throw new Error(`no mock response queued for ${endpoint}`);
    }
    const resolved = typeof responder === "function" ? responder(params) : responder;
    const reply = typeof resolved === "string" ? { body: resolved } : resolved;
    if (reply.delayMs) await sleep(reply.delayMs);
    return new HttpResponse(reply.body, {
      status: reply.status ?? 200,
      headers: { "content-type": reply.contentType ?? "text/html; charset=UTF-8" },
    });
  }

  const server = setupServer(
    http.post(`${GATEWAY_ORIGIN}/api/transact.php`, ({ request }) =>
      respond(transactRequests, transactQueue, transactFallback, request, "transact.php"),
    ),
    http.post(`${GATEWAY_ORIGIN}/api/query.php`, ({ request }) =>
      respond(queryRequests, queryQueue, queryFallback, request, "query.php"),
    ),
  );

  return {
    server,
    transactRequests,
    queryRequests,
    onTransact: (responder) => transactQueue.push(responder),
    transactDefault: (responder) => {
      transactFallback = responder;
    },
    onQuery: (responder) => queryQueue.push(responder),
    queryDefault: (responder) => {
      queryFallback = responder;
    },
    reset: () => {
      transactRequests.length = 0;
      queryRequests.length = 0;
      transactQueue.length = 0;
      queryQueue.length = 0;
      transactFallback = null;
      queryFallback = null;
    },
  };
}
