import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import Kicbac from "../src/index";
import { compactParams, encodeParams } from "../src/encode";
import { approvedBody, createGateway, TEST_KEY } from "./helpers/gateway";

const gw = createGateway();
beforeAll(() => gw.server.listen({ onUnhandledRequest: "error" }));
afterEach(() => {
  gw.server.resetHandlers();
  gw.reset();
});
afterAll(() => gw.server.close());

const client = new Kicbac({ securityKey: TEST_KEY });

describe("encodeParams", () => {
  it("encodes &, =, +, % and spaces (space -> + for PHP)", () => {
    expect(encodeParams({ a: "x&y", b: "p=q", c: "1+1", d: "100%", e: "two words" })).toBe(
      "a=x%26y&b=p%3Dq&c=1%2B1&d=100%25&e=two+words",
    );
  });

  it("round-trips through URLSearchParams decoding", () => {
    const values = {
      ampersand: "a&b",
      equals: "a=b",
      plus: "a+b",
      percent: "100%",
      spaces: "two words here",
      newline: "line1\nline2",
    };
    const decoded = new URLSearchParams(encodeParams(values));
    for (const [key, value] of Object.entries(values)) {
      expect(decoded.get(key)).toBe(value);
    }
  });

  it("handles unicode: 日本語, Müller, emoji", () => {
    const values = { jp: "日本語", de: "Müller", emoji: "🙂 emoji" };
    const decoded = new URLSearchParams(encodeParams(values));
    expect(decoded.get("jp")).toBe("日本語");
    expect(decoded.get("de")).toBe("Müller");
    expect(decoded.get("emoji")).toBe("🙂 emoji");
  });

  it("compactParams skips undefined and null values", () => {
    expect(compactParams({ keep: "x", u: undefined, n: null, empty: "" })).toEqual({
      keep: "x",
      empty: "",
    });
  });
});

describe("round-trip through the mock gateway", () => {
  it("delivers special characters intact to the gateway", async () => {
    gw.onTransact(approvedBody());
    await client.transactions.sale({
      amount: "49.99",
      paymentToken: "tok_123",
      orderDescription: "Müller & Söhne — 日本語 a=b 100% + 🙂\nsecond line",
      billing: { firstName: "Ana María", lastName: "O'Brien & Co" },
    });
    const sent = gw.transactRequests[0]!;
    expect(sent.get("order_description")).toBe("Müller & Söhne — 日本語 a=b 100% + 🙂\nsecond line");
    expect(sent.get("first_name")).toBe("Ana María");
    expect(sent.get("last_name")).toBe("O'Brien & Co");
    expect(sent.get("amount")).toBe("49.99");
  });

  it("never sends undefined params", async () => {
    gw.onTransact(approvedBody());
    await client.transactions.sale({ amount: "10.00", paymentToken: "tok_123" });
    const sent = gw.transactRequests[0]!;
    expect(sent.has("orderid")).toBe(false);
    expect(sent.has("first_name")).toBe(false);
    expect(sent.has("ccnumber")).toBe(false);
  });

  it("maps merchantDefinedFields to merchant_defined_field_N", async () => {
    gw.onTransact(approvedBody());
    await client.transactions.sale({
      amount: "10.00",
      paymentToken: "tok_123",
      merchantDefinedFields: { 1: "alpha", 12: "beta", 20: "gamma" },
    });
    const sent = gw.transactRequests[0]!;
    expect(sent.get("merchant_defined_field_1")).toBe("alpha");
    expect(sent.get("merchant_defined_field_12")).toBe("beta");
    expect(sent.get("merchant_defined_field_20")).toBe("gamma");
  });
});
