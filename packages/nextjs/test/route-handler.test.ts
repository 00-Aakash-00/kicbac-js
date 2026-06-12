import { beforeEach, describe, expect, it, vi } from "vitest";
import { createKicbacRouteHandler } from "../src/server/index.js";
import type { KicbacSaleResult, KicbacServerClient } from "../src/server/index.js";

function chargeRequest(body: unknown): Request {
  return new Request("http://localhost/api/kicbac", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

function stubClient(result: KicbacSaleResult | Error) {
  const sale = vi.fn((_params: Record<string, unknown>) =>
    result instanceof Error ? Promise.reject(result) : Promise.resolve(result),
  );
  const client: KicbacServerClient = { transactions: { sale } };
  return { client, sale };
}

const APPROVED: KicbacSaleResult = {
  ok: true,
  transactionId: "tx_1",
  authCode: "AUTH1",
  raw: { response: "1" },
};

beforeEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("factory amount-strategy matrix", () => {
  const { client } = stubClient(APPROVED);
  const resolver = () => "10.00";

  it("throws synchronously when NO strategy is configured, refusing client totals", () => {
    expect(() => createKicbacRouteHandler({ client })).toThrow(/refuses to trust client/i);
  });

  it.each([
    ["amount", { amount: "10.00" }],
    ["amountResolver", { amountResolver: resolver }],
    ["allowInsecureClientAmount", { allowInsecureClientAmount: true as const }],
  ])("accepts exactly one strategy: %s", (_name, strategy) => {
    expect(() => createKicbacRouteHandler({ client, ...strategy })).not.toThrow();
  });

  it.each([
    ["amount + amountResolver", { amount: "1.00", amountResolver: resolver }],
    ["amount + allowInsecure", { amount: "1.00", allowInsecureClientAmount: true as const }],
    ["resolver + allowInsecure", { amountResolver: resolver, allowInsecureClientAmount: true as const }],
    [
      "all three",
      { amount: "1.00", amountResolver: resolver, allowInsecureClientAmount: true as const },
    ],
  ])("throws when two+ strategies are configured: %s", (_name, strategies) => {
    expect(() => createKicbacRouteHandler({ client, ...strategies })).toThrow(/exactly ONE/);
  });

  it("rejects a malformed fixed amount at factory time", () => {
    expect(() => createKicbacRouteHandler({ client, amount: "1,000.00" })).toThrow(/invalid amount/);
  });
});

describe("request validation", () => {
  it("400 on invalid JSON", async () => {
    const { client } = stubClient(APPROVED);
    const { POST } = createKicbacRouteHandler({ client, amount: "10.00" });
    const res = await POST(chargeRequest("{not json"));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ ok: false, code: "invalid_request" });
  });

  it("400 on missing token, naming the payment form", async () => {
    const { client, sale } = stubClient(APPROVED);
    const { POST } = createKicbacRouteHandler({ client, amount: "10.00" });
    const res = await POST(chargeRequest({ amount: "10.00" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe("invalid_request");
    expect(body.message).toMatch(/token/i);
    expect(sale).not.toHaveBeenCalled();
  });

  it.each([
    ["bare PAN", "4111111111111111"],
    ["PAN with spaces", "4111 1111 1111 1111"],
    ["PAN with dashes", "4111-1111-1111-1111"],
    ["19-digit PAN", "6011111111111111117"],
  ])("400 on PAN-shaped token (%s) without echoing any digits", async (_name, pan) => {
    const { client, sale } = stubClient(APPROVED);
    const { POST } = createKicbacRouteHandler({ client, amount: "10.00" });
    const res = await POST(chargeRequest({ token: pan }));
    expect(res.status).toBe(400);
    const text = await res.text();
    expect(text).not.toContain("4111");
    expect(text).not.toContain("6011");
    expect(text).toMatch(/raw card/i);
    expect(sale).not.toHaveBeenCalled();
  });

  it("accepts a real Collect.js-style token (letters + dashes)", async () => {
    const { client, sale } = stubClient(APPROVED);
    const { POST } = createKicbacRouteHandler({ client, amount: "10.00" });
    const res = await POST(chargeRequest({ token: "3455zJms-7qA2K2-VdVrSu-Rv7WpvPuG7s8" }));
    expect(res.status).toBe(200);
    expect(sale).toHaveBeenCalledTimes(1);
  });
});

describe("amount strategies at request time", () => {
  it("fixed amount IGNORES the body amount entirely", async () => {
    const { client, sale } = stubClient(APPROVED);
    const { POST } = createKicbacRouteHandler({ client, amount: "10.00" });
    const res = await POST(chargeRequest({ token: "tok_x", amount: "99999.99" }));
    expect(res.status).toBe(200);
    expect(sale).toHaveBeenCalledWith(
      expect.objectContaining({ amount: "10.00", paymentToken: "tok_x" }),
    );
    expect((await res.json()).amount).toBe("10.00");
  });

  it("amountResolver receives { body, request } and its result is charged", async () => {
    const { client, sale } = stubClient(APPROVED);
    const amountResolver = vi.fn(
      (ctx: { body: { token: string; metadata?: Record<string, unknown> }; request: Request }) => {
        expect(ctx.body.token).toBe("tok_x");
        expect(ctx.body.metadata).toEqual({ cartId: "c_1" });
        expect(ctx.request).toBeInstanceOf(Request);
        return "42.42";
      },
    );
    const { POST } = createKicbacRouteHandler({ client, amountResolver });
    const res = await POST(chargeRequest({ token: "tok_x", metadata: { cartId: "c_1" } }));
    expect(res.status).toBe(200);
    expect(amountResolver).toHaveBeenCalledTimes(1);
    expect(sale).toHaveBeenCalledWith(expect.objectContaining({ amount: "42.42" }));
  });

  it("amountResolver throw → 500 redacted; details only reach onError", async () => {
    const { client, sale } = stubClient(APPROVED);
    const secretError = new Error("SELECT * FROM carts failed: secret-connection-string");
    const onError = vi.fn();
    const { POST } = createKicbacRouteHandler({
      client,
      onError,
      amountResolver: () => {
        throw secretError;
      },
    });
    const res = await POST(chargeRequest({ token: "tok_x" }));
    expect(res.status).toBe(500);
    const text = await res.text();
    expect(text).not.toContain("secret-connection-string");
    expect(JSON.parse(text)).toMatchObject({ ok: false, code: "server_error" });
    expect(onError).toHaveBeenCalledWith(secretError);
    expect(sale).not.toHaveBeenCalled();
  });

  it("allowInsecureClientAmount charges the body amount", async () => {
    const { client, sale } = stubClient(APPROVED);
    const { POST } = createKicbacRouteHandler({ client, allowInsecureClientAmount: true });
    const res = await POST(chargeRequest({ token: "tok_x", amount: "12.34" }));
    expect(res.status).toBe(200);
    expect(sale).toHaveBeenCalledWith(expect.objectContaining({ amount: "12.34" }));
  });

  it.each([
    ["missing", {}],
    ["not a string", { amount: 12.34 }],
    ["bad format", { amount: "12.345" }],
  ])("allowInsecureClientAmount rejects %s amount with 400", async (_name, extra) => {
    const { client, sale } = stubClient(APPROVED);
    const { POST } = createKicbacRouteHandler({ client, allowInsecureClientAmount: true });
    const res = await POST(chargeRequest({ token: "tok_x", ...extra }));
    expect(res.status).toBe(400);
    expect(sale).not.toHaveBeenCalled();
  });
});

describe("result mapping", () => {
  it("declined result → 402 {ok:false, code, message}, never 200", async () => {
    const { client } = stubClient({ ok: false, code: 200, message: "DECLINE", raw: {} });
    const { POST } = createKicbacRouteHandler({ client, amount: "10.00" });
    const res = await POST(chargeRequest({ token: "tok_x" }));
    expect(res.status).toBe(402);
    expect(await res.json()).toEqual({ ok: false, code: 200, message: "DECLINE" });
  });

  it("thrown ProcessorError → 402 with its gateway response code", async () => {
    const processorError = Object.assign(new Error("Transaction was rejected"), {
      responseCode: 430,
      responseText: "Duplicate transaction REFID:123",
    });
    Object.defineProperty(processorError, "name", { value: "ProcessorError" });
    const { client } = stubClient(processorError);
    const { POST } = createKicbacRouteHandler({ client, amount: "10.00" });
    const res = await POST(chargeRequest({ token: "tok_x" }));
    expect(res.status).toBe(402);
    expect(await res.json()).toEqual({
      ok: false,
      code: 430,
      message: "Duplicate transaction REFID:123",
    });
  });

  it("unexpected throw → 500 redacted, onError receives the original", async () => {
    const boom = new Error("ECONNREFUSED 10.0.0.5:443 security_key=sk_live_123");
    const { client } = stubClient(boom);
    const onError = vi.fn();
    const { POST } = createKicbacRouteHandler({ client, amount: "10.00", onError });
    const res = await POST(chargeRequest({ token: "tok_x" }));
    expect(res.status).toBe(500);
    const text = await res.text();
    expect(text).not.toContain("sk_live_123");
    expect(text).not.toContain("ECONNREFUSED");
    expect(onError).toHaveBeenCalledWith(boom);
  });

  it("saleParams are merged into the gateway request", async () => {
    const { client, sale } = stubClient(APPROVED);
    const { POST } = createKicbacRouteHandler({
      client,
      amount: "10.00",
      saleParams: ({ body }) => ({ orderId: String(body.metadata?.["orderId"]) }),
    });
    await POST(chargeRequest({ token: "tok_x", metadata: { orderId: "o_77" } }));
    expect(sale).toHaveBeenCalledWith(
      expect.objectContaining({ amount: "10.00", paymentToken: "tok_x", orderId: "o_77" }),
    );
  });
});

describe("lazy client init", () => {
  it("imports the kicbac package only at first request and reuses the instance", async () => {
    const sale = vi.fn().mockResolvedValue(APPROVED);
    const constructed: Array<Record<string, unknown> | undefined> = [];
    vi.doMock("kicbac", () => ({
      default: class FakeKicbac {
        transactions = { sale };
        constructor(config?: Record<string, unknown>) {
          constructed.push(config);
        }
      },
    }));
    const { createKicbacRouteHandler: factory } = await import("../src/server/index.js");

    const { POST } = factory({ amount: "10.00", securityKey: "sk_test_1" });
    expect(constructed).toHaveLength(0); // factory call does NOT import/construct

    const res1 = await POST(chargeRequest({ token: "tok_x" }));
    const res2 = await POST(chargeRequest({ token: "tok_y" }));
    expect(res1.status).toBe(200);
    expect(res2.status).toBe(200);
    expect(constructed).toEqual([{ securityKey: "sk_test_1" }]); // exactly one client
    expect(sale).toHaveBeenCalledTimes(2);
    vi.doUnmock("kicbac");
  });
});

describe("saleParams cannot override server-owned fields", () => {
  it("ignores an `amount` returned by saleParams (fixed amount wins)", async () => {
    const { client, sale } = stubClient(APPROVED);
    const { POST } = createKicbacRouteHandler({
      client,
      amount: "10.00",
      saleParams: () => ({ amount: "0.01", orderId: "ord_1" }),
    });
    await POST(chargeRequest({ token: "tok_abc" }));
    expect(sale).toHaveBeenCalledTimes(1);
    const params = sale.mock.calls[0]![0];
    expect(params["amount"]).toBe("10.00");
    expect(params["orderId"]).toBe("ord_1");
  });

  it("ignores an `amount` returned by saleParams in resolver mode", async () => {
    const { client, sale } = stubClient(APPROVED);
    const { POST } = createKicbacRouteHandler({
      client,
      amountResolver: () => "25.00",
      saleParams: () => ({ amount: "0.01" }),
    });
    await POST(chargeRequest({ token: "tok_abc" }));
    expect(sale.mock.calls[0]![0]["amount"]).toBe("25.00");
  });

  it("strips token/security_key/type and prototype-pollution keys from saleParams", async () => {
    const { client, sale } = stubClient(APPROVED);
    const { POST } = createKicbacRouteHandler({
      client,
      amount: "10.00",
      saleParams: () =>
        ({
          paymentToken: "evil",
          payment_token: "evil2",
          security_key: "leak",
          type: "refund",
          __proto__: { polluted: true },
          orderId: "ok",
        }) as Record<string, unknown>,
    });
    await POST(chargeRequest({ token: "tok_real" }));
    const params = sale.mock.calls[0]![0];
    expect(params["paymentToken"]).toBe("tok_real");
    expect(params["payment_token"]).toBeUndefined();
    expect(params["security_key"]).toBeUndefined();
    expect(params["type"]).toBeUndefined();
    expect(params["orderId"]).toBe("ok");
    expect(({} as Record<string, unknown>)["polluted"]).toBeUndefined();
  });
});

describe("body-size DoS guard", () => {
  it("rejects a body over the size cap (declared content-length)", async () => {
    const { client } = stubClient(APPROVED);
    const { POST } = createKicbacRouteHandler({ client, amount: "10.00" });
    const big = JSON.stringify({ token: "t", metadata: { x: "a".repeat(200_000) } });
    const req = new Request("http://localhost/api/kicbac", {
      method: "POST",
      headers: { "content-type": "application/json", "content-length": String(big.length) },
      body: big,
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("invalid_request");
  });
});
