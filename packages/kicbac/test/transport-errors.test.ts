import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import Kicbac, {
  ConnectionError,
  HttpError,
  RateLimitError,
  TimeoutError,
} from "../src/index";
import { approvedBody, createGateway, TEST_KEY } from "./helpers/gateway";

const gw = createGateway();
beforeAll(() => gw.server.listen({ onUnhandledRequest: "error" }));
afterEach(() => {
  gw.server.resetHandlers();
  gw.reset();
});
afterAll(() => gw.server.close());

/** Build a fetch stub that rejects like undici with the given cause code. */
function failingFetch(code: string): typeof fetch {
  return () =>
    Promise.reject(
      Object.assign(new TypeError("fetch failed"), {
        cause: Object.assign(new Error(`request failed: ${code}`), { code }),
      }),
    );
}

function clientWithFetch(fetchImpl: typeof fetch): Kicbac {
  return new Kicbac({ securityKey: TEST_KEY, fetch: fetchImpl, maxRetries: 0 });
}

describe("connect-phase failures -> sent: false", () => {
  const PRE_SEND = [
    "ENOTFOUND",
    "EAI_AGAIN",
    "ECONNREFUSED",
    "EHOSTUNREACH",
    "ENETUNREACH",
    "UND_ERR_CONNECT_TIMEOUT",
  ];

  it.for(PRE_SEND)("%s is provably pre-send", async (code) => {
    const client = clientWithFetch(failingFetch(code));
    let caught: unknown;
    try {
      await client.transactions.sale({ amount: "10.00", paymentToken: "tok" });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(ConnectionError);
    expect((caught as ConnectionError).sent).toBe(false);
  });

  it.for(["ERR_TLS_CERT_ALTNAME_INVALID", "CERT_HAS_EXPIRED", "UNABLE_TO_VERIFY_LEAF_SIGNATURE", "UNABLE_TO_GET_ISSUER_CERT", "SELF_SIGNED_CERT_IN_CHAIN"])(
    "TLS failure %s is provably pre-send",
    async (code) => {
      const client = clientWithFetch(failingFetch(code));
      let caught: unknown;
      try {
        await client.transactions.sale({ amount: "10.00", paymentToken: "tok" });
      } catch (error) {
        caught = error;
      }
      expect(caught).toBeInstanceOf(ConnectionError);
      expect((caught as ConnectionError).sent).toBe(false);
    },
  );

  it("finds the code on nested AggregateError causes", async () => {
    const aggregate = new AggregateError([
      Object.assign(new Error("connect ECONNREFUSED ::1:443"), { code: "ECONNREFUSED" }),
    ]);
    const client = clientWithFetch(() =>
      Promise.reject(Object.assign(new TypeError("fetch failed"), { cause: aggregate })),
    );
    let caught: unknown;
    try {
      await client.transactions.sale({ amount: "10.00", paymentToken: "tok" });
    } catch (error) {
      caught = error;
    }
    expect((caught as ConnectionError).sent).toBe(false);
  });

  it("classifies uniform pre-send AggregateError codes as sent: false", async () => {
    const aggregate = new AggregateError([
      Object.assign(new Error("connect ECONNREFUSED 127.0.0.1:443"), { code: "ECONNREFUSED" }),
      Object.assign(new Error("connect ECONNREFUSED ::1:443"), { code: "ECONNREFUSED" }),
    ]);
    const client = clientWithFetch(() =>
      Promise.reject(Object.assign(new TypeError("fetch failed"), { cause: aggregate })),
    );
    let caught: unknown;
    try {
      await client.transactions.sale({ amount: "10.00", paymentToken: "tok" });
    } catch (error) {
      caught = error;
    }
    expect((caught as ConnectionError).sent).toBe(false);
  });
});

// DOUBLE-CHARGE LOCK: happy-eyeballs surfaces an AggregateError with one code
// per connection attempt. If ANY code in the tree is post-connect (ECONNRESET,
// ETIMEDOUT, ...), some attempt may have transmitted the request — the
// classification must be "unknown" REGARDLESS of code order.
describe('mixed AggregateError codes -> sent: "unknown" (order-independent)', () => {
  const mixedCases: Array<[string, string[]]> = [
    ["pre-send first", ["ECONNREFUSED", "ECONNRESET"]],
    ["post-send first", ["ECONNRESET", "ECONNREFUSED"]],
    ["socket timeout second", ["ECONNREFUSED", "ETIMEDOUT"]],
    ["socket timeout first", ["ETIMEDOUT", "ECONNREFUSED"]],
  ];

  it.for(mixedCases)("%s", async ([, codes]) => {
    const aggregate = new AggregateError(
      codes.map((code) => Object.assign(new Error(`connect ${code}`), { code })),
    );
    const client = clientWithFetch(() =>
      Promise.reject(Object.assign(new TypeError("fetch failed"), { cause: aggregate })),
    );
    let caught: unknown;
    try {
      await client.transactions.sale({ amount: "10.00", paymentToken: "tok" });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(ConnectionError);
    expect((caught as ConnectionError).sent).toBe("unknown");
  });

  it('classifies a post-connect code nested under a pre-send wrapper as "unknown"', async () => {
    // A wrapper carrying a pre-send code whose cause chain reveals a
    // post-connect failure must NOT be treated as provably pre-send.
    const wrapped = Object.assign(new Error("wrapped"), {
      code: "ECONNREFUSED",
      cause: Object.assign(new Error("read ECONNRESET"), { code: "ECONNRESET" }),
    });
    const client = clientWithFetch(() =>
      Promise.reject(Object.assign(new TypeError("fetch failed"), { cause: wrapped })),
    );
    let caught: unknown;
    try {
      await client.transactions.sale({ amount: "10.00", paymentToken: "tok" });
    } catch (error) {
      caught = error;
    }
    expect((caught as ConnectionError).sent).toBe("unknown");
  });
});

describe("mid-flight failures -> sent: \"unknown\"", () => {
  it.for(["ECONNRESET", "EPIPE", "UND_ERR_SOCKET"])("%s is ambiguous", async (code) => {
    const client = clientWithFetch(failingFetch(code));
    let caught: unknown;
    try {
      await client.transactions.sale({ amount: "10.00", paymentToken: "tok" });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(ConnectionError);
    expect((caught as ConnectionError).sent).toBe("unknown");
  });

  it("a codeless fetch failure is ambiguous", async () => {
    const client = clientWithFetch(() => Promise.reject(new TypeError("fetch failed")));
    let caught: unknown;
    try {
      await client.transactions.sale({ amount: "10.00", paymentToken: "tok" });
    } catch (error) {
      caught = error;
    }
    expect((caught as ConnectionError).sent).toBe("unknown");
  });
});

describe("response body read failure -> sent: true", () => {
  it("res.text() rejection means the request WAS sent", async () => {
    const fakeResponse = {
      status: 200,
      headers: new Headers({ "content-type": "text/html" }),
      text: () => Promise.reject(new Error("socket hang up mid-body")),
    } as unknown as Response;
    const client = clientWithFetch(() => Promise.resolve(fakeResponse));
    let caught: unknown;
    try {
      await client.transactions.sale({ amount: "10.00", paymentToken: "tok" });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(ConnectionError);
    expect((caught as ConnectionError).sent).toBe(true);
  });
});

describe("HTTP status errors", () => {
  it("502 -> HttpError with status and bodySnippet", async () => {
    const client = clientWithFetch(() =>
      Promise.resolve(new Response("<html>Bad Gateway</html>", { status: 502 })),
    );
    let caught: unknown;
    try {
      await client.transactions.sale({ amount: "10.00", paymentToken: "tok" });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(HttpError);
    expect((caught as HttpError).status).toBe(502);
    expect((caught as HttpError).bodySnippet).toContain("Bad Gateway");
  });

  it("429 -> RateLimitError with httpStatus 429", async () => {
    const client = clientWithFetch(() =>
      Promise.resolve(new Response("Too Many Requests", { status: 429 })),
    );
    let caught: unknown;
    try {
      await client.transactions.sale({ amount: "10.00", paymentToken: "tok" });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(RateLimitError);
    expect((caught as RateLimitError).httpStatus).toBe(429);
    expect((caught as RateLimitError).responseCode).toBeNull();
  });
});

describe("timeouts", () => {
  it("a slow gateway trips the per-attempt timer -> TimeoutError", async () => {
    gw.onTransact({ body: approvedBody(), delayMs: 300 });
    const client = new Kicbac({ securityKey: TEST_KEY, timeoutMs: 40, maxRetries: 0 });
    let caught: unknown;
    try {
      await client.transactions.sale({ amount: "10.00", paymentToken: "tok" });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(TimeoutError);
    expect((caught as TimeoutError).timeoutMs).toBe(40);
  });

  it("per-request timeoutMs overrides the client default", async () => {
    gw.onTransact({ body: approvedBody(), delayMs: 300 });
    const client = new Kicbac({ securityKey: TEST_KEY, timeoutMs: 30_000, maxRetries: 0 });
    let caught: unknown;
    try {
      await client.transactions.sale(
        { amount: "10.00", paymentToken: "tok" },
        { timeoutMs: 35 },
      );
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(TimeoutError);
    expect((caught as TimeoutError).timeoutMs).toBe(35);
  });
});

describe("user aborts", () => {
  it("pre-aborted signal: the user's reason is rethrown and nothing is sent", async () => {
    const reason = new Error("caller changed its mind");
    const controller = new AbortController();
    controller.abort(reason);
    const client = new Kicbac({ securityKey: TEST_KEY });
    await expect(
      client.transactions.sale({ amount: "10.00", paymentToken: "tok" }, { signal: controller.signal }),
    ).rejects.toBe(reason);
    expect(gw.transactRequests).toHaveLength(0);
  });

  it("mid-flight abort: the user's reason is rethrown untouched", async () => {
    gw.onTransact({ body: approvedBody(), delayMs: 500 });
    const reason = new Error("user clicked cancel");
    const controller = new AbortController();
    const client = new Kicbac({ securityKey: TEST_KEY });
    const promise = client.transactions.sale(
      { amount: "10.00", paymentToken: "tok" },
      { signal: controller.signal },
    );
    setTimeout(() => controller.abort(reason), 20);
    await expect(promise).rejects.toBe(reason);
  });

  it("errors carry pre-redacted request context", async () => {
    const client = clientWithFetch(failingFetch("ECONNREFUSED"));
    let caught: unknown;
    try {
      await client.transactions.sale({
        amount: "10.00",
        card: { number: "4111111111111111", expiry: "1029", cvv: "999" },
      });
    } catch (error) {
      caught = error;
    }
    const connectionError = caught as ConnectionError;
    expect(connectionError.request).toBeDefined();
    expect(connectionError.request?.url).toContain("/api/transact.php");
    expect(connectionError.request?.params["ccnumber"]).toBe("****1111");
    expect(connectionError.request?.params["cvv"]).toBe("[REDACTED]");
    expect(connectionError.request?.params["security_key"]).toBe("[REDACTED]");
  });
});
