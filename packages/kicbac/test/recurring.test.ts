import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import Kicbac from "../src/index";
import { approvedBody, createGateway, declinedBody, TEST_KEY } from "./helpers/gateway";

const gw = createGateway();
beforeAll(() => gw.server.listen({ onUnhandledRequest: "error" }));
afterEach(() => {
  gw.server.resetHandlers();
  gw.reset();
});
afterAll(() => gw.server.close());

const client = new Kicbac({ securityKey: TEST_KEY });

function lastRequest(): URLSearchParams {
  return gw.transactRequests[gw.transactRequests.length - 1]!;
}

describe("plans.create", () => {
  it("sends recurring=add_plan with exact plan variables (day frequency)", async () => {
    gw.onTransact(approvedBody({ responsetext: "Plan Added" }));
    const result = await client.plans.create({
      planId: "gold-monthly",
      name: "Gold Monthly",
      amount: "20.00",
      payments: 0,
      dayFrequency: 30,
    });
    const sent = lastRequest();
    expect(sent.get("recurring")).toBe("add_plan");
    expect(sent.get("plan_id")).toBe("gold-monthly");
    expect(sent.get("plan_name")).toBe("Gold Monthly");
    expect(sent.get("plan_amount")).toBe("20.00");
    expect(sent.get("plan_payments")).toBe("0");
    expect(sent.get("day_frequency")).toBe("30");
    expect(sent.has("month_frequency")).toBe(false);
    expect(result.ok && result.planId).toBe("gold-monthly");
  });

  it("supports month_frequency + day_of_month", async () => {
    gw.onTransact(approvedBody({ responsetext: "Plan Added" }));
    await client.plans.create({
      planId: "q",
      name: "Quarterly",
      amount: "60.00",
      payments: 4,
      monthFrequency: 3,
      dayOfMonth: 15,
    });
    const sent = lastRequest();
    expect(sent.get("month_frequency")).toBe("3");
    expect(sent.get("day_of_month")).toBe("15");
    expect(sent.has("day_frequency")).toBe(false);
  });
});

describe("plans.update", () => {
  it("sends recurring=edit_plan with current_plan_id", async () => {
    gw.onTransact(approvedBody({ responsetext: "Plan Updated" }));
    await client.plans.update({ currentPlanId: "gold-monthly", amount: "25.00" });
    const sent = lastRequest();
    expect(sent.get("recurring")).toBe("edit_plan");
    expect(sent.get("current_plan_id")).toBe("gold-monthly");
    expect(sent.get("plan_amount")).toBe("25.00");
  });
});

describe("subscriptions.create", () => {
  it("subscribes to an existing plan (plan_id) with a payment token", async () => {
    gw.onTransact(approvedBody({ subscription_id: "7000001", transactionid: "" }));
    const result = await client.subscriptions.create({
      planId: "gold-monthly",
      paymentToken: "tok_collectjs",
      startDate: "20260701",
      billing: { firstName: "Jess", lastName: "Jones" },
    });
    const sent = lastRequest();
    expect(sent.get("recurring")).toBe("add_subscription");
    expect(sent.get("plan_id")).toBe("gold-monthly");
    expect(sent.get("payment_token")).toBe("tok_collectjs");
    expect(sent.get("start_date")).toBe("20260701");
    expect(sent.get("first_name")).toBe("Jess");
    expect(result.ok && result.subscriptionId).toBe("7000001");
  });

  it("creates a custom subscription with inline plan fields", async () => {
    gw.onTransact(approvedBody({ subscription_id: "7000002" }));
    await client.subscriptions.create({
      plan: { amount: "9.99", payments: 12, monthFrequency: 1, dayOfMonth: 1 },
      card: { number: "4111111111111111", expiry: "1029" },
    });
    const sent = lastRequest();
    expect(sent.get("recurring")).toBe("add_subscription");
    expect(sent.has("plan_id")).toBe(false);
    expect(sent.get("plan_amount")).toBe("9.99");
    expect(sent.get("plan_payments")).toBe("12");
    expect(sent.get("month_frequency")).toBe("1");
    expect(sent.get("day_of_month")).toBe("1");
    expect(sent.get("ccnumber")).toBe("4111111111111111");
  });

  it("falls back to transactionid when subscription_id is absent (older accounts)", async () => {
    gw.onTransact(approvedBody({ transactionid: "8123456789" }));
    const result = await client.subscriptions.create({
      planId: "gold-monthly",
      paymentToken: "tok",
    });
    expect(result.ok && result.subscriptionId).toBe("8123456789");
  });

  it("prefers subscription_id over transactionid when both arrive", async () => {
    gw.onTransact(approvedBody({ subscription_id: "sub-1", transactionid: "txn-1" }));
    const result = await client.subscriptions.create({ planId: "p", paymentToken: "tok" });
    expect(result.ok && result.subscriptionId).toBe("sub-1");
  });

  it("declined card on subscription -> ok:false result", async () => {
    gw.onTransact(declinedBody({ response_code: "223", responsetext: "Expired card." }));
    const result = await client.subscriptions.create({ planId: "p", paymentToken: "tok" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe(223);
  });
});

describe("subscriptions.update / delete", () => {
  it("update sends recurring=update_subscription with plan tweaks and pause", async () => {
    gw.onTransact(approvedBody({ subscription_id: "7000001" }));
    await client.subscriptions.update({
      subscriptionId: "7000001",
      plan: { amount: "12.50" },
      paused: true,
    });
    const sent = lastRequest();
    expect(sent.get("recurring")).toBe("update_subscription");
    expect(sent.get("subscription_id")).toBe("7000001");
    expect(sent.get("plan_amount")).toBe("12.50");
    expect(sent.get("paused_subscription")).toBe("true");
  });

  it("delete sends recurring=delete_subscription", async () => {
    gw.onTransact(approvedBody({ responsetext: "Subscription Deleted", subscription_id: "7000001" }));
    const result = await client.subscriptions.delete("7000001");
    const sent = lastRequest();
    expect(sent.get("recurring")).toBe("delete_subscription");
    expect(sent.get("subscription_id")).toBe("7000001");
    expect(result.ok && result.subscriptionId).toBe("7000001");
  });
});

describe("plans surface", () => {
  it("has no delete method (gateway exposes no delete_plan action)", () => {
    expect((client.plans as unknown as Record<string, unknown>)["delete"]).toBeUndefined();
  });
});
