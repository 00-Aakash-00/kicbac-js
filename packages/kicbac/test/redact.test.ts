import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import Kicbac, { GatewayError, REDACT_KEYS, redactParams, redactValue } from "../src/index";
import type { LogEntry } from "../src/index";
import { approvedBody, createGateway, errorBody, TEST_KEY } from "./helpers/gateway";

const gw = createGateway();
beforeAll(() => gw.server.listen({ onUnhandledRequest: "error" }));
afterEach(() => {
  gw.server.resetHandlers();
  gw.reset();
});
afterAll(() => gw.server.close());

const SENSITIVE_SAMPLE = "super_secret_value_123";

describe("redactParams", () => {
  it("redacts every REDACT_KEYS entry", () => {
    const params: Record<string, string> = {};
    for (const key of REDACT_KEYS) params[key] = SENSITIVE_SAMPLE;
    const redacted = redactParams(params);
    for (const key of REDACT_KEYS) {
      expect(redacted[key], key).not.toContain(SENSITIVE_SAMPLE);
    }
  });

  it("is case-insensitive", () => {
    const redacted = redactParams({ SECURITY_KEY: "abc", CCNumber: "4111111111111111" });
    expect(redacted["SECURITY_KEY"]).toBe("[REDACTED]");
    expect(redacted["CCNumber"]).toBe("****1111");
  });

  it("masks PANs to the last 4 (both ccnumber and cc_number)", () => {
    expect(redactValue("ccnumber", "4111111111111111")).toBe("****1111");
    expect(redactValue("cc_number", "5431111111111111")).toBe("****1111");
    expect(redactValue("ccnumber", "411")).toBe("****");
  });

  it("leaves non-sensitive keys untouched", () => {
    expect(redactParams({ amount: "49.99", orderid: "o1" })).toEqual({
      amount: "49.99",
      orderid: "o1",
    });
  });
});

describe("logger redaction", () => {
  it("every logger() entry has card data and the key redacted", async () => {
    const entries: LogEntry[] = [];
    const client = new Kicbac({ securityKey: TEST_KEY, logger: (entry) => entries.push(entry) });
    gw.onTransact(approvedBody());
    await client.transactions.sale({
      amount: "10.00",
      card: { number: "4111111111111111", expiry: "1029", cvv: "999" },
    });
    expect(entries.length).toBeGreaterThan(0);
    const serialized = JSON.stringify(entries);
    expect(serialized).not.toContain("4111111111111111");
    expect(serialized).not.toContain('"999"');
    expect(serialized).not.toContain(TEST_KEY);
    const requestEntry = entries.find((entry) => entry.event === "request")!;
    expect(requestEntry.params?.["ccnumber"]).toBe("****1111");
    expect(requestEntry.params?.["cvv"]).toBe("[REDACTED]");
    expect(requestEntry.params?.["security_key"]).toBe("[REDACTED]");
  });

  it("redacts known sensitive keys passed via the `extra` escape hatch", async () => {
    const entries: LogEntry[] = [];
    const client = new Kicbac({ securityKey: TEST_KEY, logger: (entry) => entries.push(entry) });
    gw.onTransact(approvedBody());
    await client.transactions.sale({
      amount: "10.00",
      paymentToken: "tok",
      // A caller reaching for a raw gateway variable the SDK already knows is
      // sensitive must still be redacted everywhere it could be logged.
      extra: { checkaba: "490000018", checkaccount: "24413815" },
    });
    const requestEntry = entries.find((entry) => entry.event === "request")!;
    expect(requestEntry.params?.["checkaba"]).toBe("[REDACTED]");
    expect(requestEntry.params?.["checkaccount"]).toBe("[REDACTED]");
    expect(JSON.stringify(entries)).not.toContain("24413815");
  });

  it("a throwing logger never breaks the payment call", async () => {
    const client = new Kicbac({
      securityKey: TEST_KEY,
      logger: () => {
        throw new Error("logger exploded");
      },
    });
    gw.onTransact(approvedBody());
    const result = await client.transactions.sale({ amount: "10.00", paymentToken: "tok" });
    expect(result.ok).toBe(true);
  });
});

describe("error toJSON redaction", () => {
  it("GatewayError.toJSON never leaks the PAN or security key", async () => {
    const client = new Kicbac({ securityKey: TEST_KEY });
    gw.onTransact(errorBody({ response_code: "300", responsetext: "Invalid amount" }));
    let caught: unknown;
    try {
      await client.transactions.sale({
        amount: "10.00",
        card: { number: "4111111111111111", expiry: "1029", cvv: "999" },
      });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(GatewayError);
    const json = JSON.stringify((caught as GatewayError).toJSON());
    expect(json).not.toContain("4111111111111111");
    expect(json).not.toContain(TEST_KEY);
    expect(json).toContain("****1111");
    // JSON.stringify(error) uses toJSON too:
    expect(JSON.stringify(caught)).not.toContain("4111111111111111");
  });

  it("error messages never contain param values", async () => {
    const client = new Kicbac({ securityKey: TEST_KEY });
    gw.onTransact(errorBody());
    let caught: unknown;
    try {
      await client.transactions.sale({
        amount: "10.00",
        card: { number: "4111111111111111", expiry: "1029" },
      });
    } catch (error) {
      caught = error;
    }
    expect((caught as Error).message).not.toContain("4111111111111111");
    expect((caught as Error).message).not.toContain(TEST_KEY);
  });
});
