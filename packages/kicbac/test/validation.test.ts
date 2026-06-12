import { afterEach, describe, expect, it, vi } from "vitest";
import Kicbac, { ValidationError } from "../src/index";
import type { SaleParams } from "../src/index";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

async function caughtFrom(promise: Promise<unknown>): Promise<ValidationError> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(ValidationError);
    return error as ValidationError;
  }
  throw new Error("expected the call to throw ValidationError");
}

describe("missing security key", () => {
  it("throws at call time with an actionable message; fetch is never called", async () => {
    vi.stubEnv("KICBAC_SECURITY_KEY", undefined);
    const fetchSpy = vi.fn();
    const client = new Kicbac({ fetch: fetchSpy as never });
    const error = await caughtFrom(client.transactions.sale({ amount: "1.00", paymentToken: "t" }));
    expect(error.message).toMatchInlineSnapshot(
      `"Missing security key. Pass { securityKey } to new Kicbac() or set KICBAC_SECURITY_KEY."`,
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("an empty-string env key counts as missing", async () => {
    vi.stubEnv("KICBAC_SECURITY_KEY", "");
    const fetchSpy = vi.fn();
    const client = new Kicbac({ fetch: fetchSpy as never });
    await caughtFrom(client.query.raw({}));
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("construction never throws (call time, not construct time)", () => {
    vi.stubEnv("KICBAC_SECURITY_KEY", undefined);
    expect(() => new Kicbac()).not.toThrow();
  });
});

describe("amount validation", () => {
  const fetchSpy = vi.fn();
  const client = new Kicbac({ securityKey: "k", fetch: fetchSpy as never });

  it('rejects "49.999" (too many decimals)', async () => {
    const error = await caughtFrom(
      client.transactions.sale({ amount: "49.999", paymentToken: "t" }),
    );
    expect(error.message).toMatchInlineSnapshot(
      `"Invalid amount: expected 1-8 digits with an optional 1-2 digit decimal part, like "49.99" (no commas, no currency symbols)."`,
    );
  });

  it('rejects ""', async () => {
    await caughtFrom(client.transactions.sale({ amount: "", paymentToken: "t" }));
  });

  it('rejects "1,000.00"', async () => {
    await caughtFrom(client.transactions.sale({ amount: "1,000.00", paymentToken: "t" }));
  });

  it("rejects a number with a money-safety message", async () => {
    const error = await caughtFrom(
      client.transactions.sale({ amount: 49.99 as unknown as string, paymentToken: "t" }),
    );
    expect(error.message).toMatchInlineSnapshot(
      `"Invalid amount: amounts must be strings like "49.99", never numbers (floating point is unsafe for money)."`,
    );
  });

  it('rejects "0.00" where a positive amount is required', async () => {
    const error = await caughtFrom(
      client.transactions.sale({ amount: "0.00", paymentToken: "t" }),
    );
    expect(error.message).toMatchInlineSnapshot(
      `"Invalid amount: the amount must be greater than zero."`,
    );
  });

  it("never echoes the bad value in the message", async () => {
    const error = await caughtFrom(
      client.transactions.sale({ amount: "4111111111111111", paymentToken: "t" }),
    );
    expect(error.message).not.toContain("4111111111111111");
  });

  it("validation happens before any network call", () => {
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("payment method validation", () => {
  const fetchSpy = vi.fn();
  const client = new Kicbac({ securityKey: "k", fetch: fetchSpy as never });

  it("rejects zero payment methods", async () => {
    const error = await caughtFrom(client.transactions.sale({ amount: "1.00" }));
    expect(error.message).toMatchInlineSnapshot(
      `"Missing payment method: provide exactly one of paymentToken, card, check, customerVaultId, googlePayData, applePayData."`,
    );
  });

  it("rejects two payment methods", async () => {
    const error = await caughtFrom(
      client.transactions.sale({
        amount: "1.00",
        paymentToken: "t",
        card: { number: "4111111111111111", expiry: "1029" },
      }),
    );
    expect(error.message).toMatchInlineSnapshot(
      `"Conflicting payment methods: provide exactly one of paymentToken, card, check, customerVaultId, googlePayData, applePayData."`,
    );
  });

  it("rejects a malformed ccexp", async () => {
    const error = await caughtFrom(
      client.transactions.sale({
        amount: "1.00",
        card: { number: "4111111111111111", expiry: "13/29" },
      }),
    );
    expect(error.message).toMatchInlineSnapshot(
      `"Invalid card.expiry: expected MMYY, e.g. "1029" for October 2029."`,
    );
  });

  it('rejects month "00" and "13"', async () => {
    await caughtFrom(
      client.transactions.sale({ amount: "1.00", card: { number: "4", expiry: "0029" } }),
    );
    await caughtFrom(
      client.transactions.sale({ amount: "1.00", card: { number: "4", expiry: "1329" } }),
    );
  });

  it("nothing was sent", () => {
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("dupSeconds validation", () => {
  const client = new Kicbac({ securityKey: "k", fetch: vi.fn() as never });

  it("rejects out-of-range and non-integer values", async () => {
    const base: SaleParams = { amount: "1.00", paymentToken: "t" };
    const error = await caughtFrom(
      client.transactions.sale({ ...base, dupSeconds: 7_862_401 }),
    );
    expect(error.message).toMatchInlineSnapshot(
      `"Invalid dupSeconds: expected an integer between 0 (disable duplicate checking) and 7862400."`,
    );
    await caughtFrom(client.transactions.sale({ ...base, dupSeconds: -1 }));
    await caughtFrom(client.transactions.sale({ ...base, dupSeconds: 1.5 }));
  });
});

describe("plan frequency XOR", () => {
  const client = new Kicbac({ securityKey: "k", fetch: vi.fn() as never });

  it("rejects both dayFrequency and monthFrequency", async () => {
    const error = await caughtFrom(
      client.plans.create({
        planId: "p1",
        name: "Plan",
        amount: "10.00",
        payments: 0,
        dayFrequency: 30,
        monthFrequency: 1,
        dayOfMonth: 1,
      }),
    );
    expect(error.message).toMatchInlineSnapshot(
      `"Invalid plan frequency: provide either dayFrequency OR (monthFrequency AND dayOfMonth), not both."`,
    );
  });

  it("rejects monthFrequency without dayOfMonth", async () => {
    const error = await caughtFrom(
      client.plans.create({ planId: "p1", name: "Plan", amount: "10.00", payments: 0, monthFrequency: 1 }),
    );
    expect(error.message).toMatchInlineSnapshot(
      `"Invalid plan frequency: monthFrequency and dayOfMonth must be provided together."`,
    );
  });

  it("rejects a plan with no frequency at all", async () => {
    const error = await caughtFrom(
      client.plans.create({ planId: "p1", name: "Plan", amount: "10.00", payments: 0 }),
    );
    expect(error.message).toMatchInlineSnapshot(
      `"Missing plan frequency: provide either dayFrequency OR (monthFrequency AND dayOfMonth)."`,
    );
  });

  it("rejects subscriptions with both planId and an inline plan", async () => {
    const error = await caughtFrom(
      client.subscriptions.create({
        planId: "p1",
        plan: { amount: "10.00", payments: 0, dayFrequency: 30 },
        paymentToken: "t",
      } as never),
    );
    expect(error.message).toMatchInlineSnapshot(
      `"Invalid subscription: provide exactly one of planId (existing plan) or plan (inline custom plan)."`,
    );
  });

  it("rejects merchantDefinedFields outside 1-20", async () => {
    const error = await caughtFrom(
      client.transactions.sale({
        amount: "1.00",
        paymentToken: "t",
        merchantDefinedFields: { 21: "nope" },
      }),
    );
    expect(error.message).toMatchInlineSnapshot(
      `"Invalid merchantDefinedFields: keys must be integers from 1 to 20 (the gateway supports merchant_defined_field_1 through _20)."`,
    );
  });
});
