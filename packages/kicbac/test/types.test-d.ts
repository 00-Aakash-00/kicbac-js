import { describe, expectTypeOf, it } from "vitest";
import type {
  ApprovedTransaction,
  DeclinedTransaction,
  KicbacEvent,
  SaleParams,
  SettlementBatchEvent,
  SubscriptionCreateParams,
  TransactionEvent,
  TransactionResult,
} from "../src/index";
import Kicbac from "../src/index";

describe("TransactionResult narrowing", () => {
  it("ok: true narrows to ApprovedTransaction", () => {
    const result = {} as TransactionResult;
    if (result.ok) {
      expectTypeOf(result).toEqualTypeOf<ApprovedTransaction>();
      expectTypeOf(result.transactionId).toEqualTypeOf<string>();
      expectTypeOf(result.authCode).toEqualTypeOf<string | null>();
      expectTypeOf(result.customerVaultId).toEqualTypeOf<string | null>();
    } else {
      expectTypeOf(result).toEqualTypeOf<DeclinedTransaction>();
      expectTypeOf(result.code).toEqualTypeOf<number>();
      expectTypeOf(result.message).toEqualTypeOf<string>();
    }
  });

  it("declined results have no authCode", () => {
    expectTypeOf<DeclinedTransaction>().not.toHaveProperty("authCode");
    expectTypeOf<DeclinedTransaction>().not.toHaveProperty("customerVaultId");
  });
});

describe("Money rejects numbers", () => {
  it("amount must be a string", () => {
    expectTypeOf<SaleParams["amount"]>().toEqualTypeOf<string>();
    expectTypeOf<number>().not.toExtend<SaleParams["amount"]>();
    // @ts-expect-error - numbers are not valid amounts
    const bad: SaleParams = { amount: 49.99, paymentToken: "tok" };
    void bad;
  });

  it("dupSeconds is a number, not a string", () => {
    expectTypeOf<NonNullable<SaleParams["dupSeconds"]>>().toEqualTypeOf<number>();
  });
});

describe("subscription create plan XOR", () => {
  it("rejects both planId and plan together", () => {
    // @ts-expect-error - planId and plan are mutually exclusive
    const bad: SubscriptionCreateParams = {
      planId: "p",
      plan: { amount: "1.00", payments: 0 },
      paymentToken: "tok",
    };
    void bad;
  });
});

describe("offline requires authorizationCode", () => {
  it("is a compile error to omit authorizationCode", async () => {
    const client = new Kicbac({ securityKey: "k" });
    // @ts-expect-error - authorizationCode is required for offline
    void client.transactions.offline({ amount: "1.00", paymentToken: "tok" });
  });
});

describe("KicbacEvent narrows on event_type", () => {
  it("narrows to the per-family event interface", () => {
    const event = {} as KicbacEvent;
    if (event.event_type === "settlement.batch.complete") {
      expectTypeOf(event).toEqualTypeOf<SettlementBatchEvent>();
      expectTypeOf(event.event_body.transaction_ids).toEqualTypeOf<string[] | undefined>();
    }
    if (event.event_type === "transaction.sale.success") {
      expectTypeOf(event).toEqualTypeOf<TransactionEvent>();
      expectTypeOf(event.event_body.transaction_id).toEqualTypeOf<string | undefined>();
    }
    if (event.event_type === "recurring.plan.add") {
      expectTypeOf(event.event_body.amount).toEqualTypeOf<string | undefined>();
    }
  });

  it("unknown event types are rejected at compile time", () => {
    const event = {} as KicbacEvent;
    // @ts-expect-error - not a documented event family
    if (event.event_type === "totally.made.up") {
      void event;
    }
  });
});
