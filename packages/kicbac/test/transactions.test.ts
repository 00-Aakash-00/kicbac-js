import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import Kicbac, { ValidationError } from "../src/index";
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

describe("transactions.sale", () => {
  it("sends the exact gateway variables for a card sale", async () => {
    gw.onTransact(approvedBody());
    await client.transactions.sale({
      amount: "49.99",
      card: { number: "4111111111111111", expiry: "1029", cvv: "999" },
      billing: {
        firstName: "Jane",
        lastName: "Doe",
        address1: "888 Main St",
        city: "Austin",
        state: "TX",
        zip: "77777",
        country: "US",
        email: "jane@example.com",
        phone: "5125550100",
      },
      shipping: { firstName: "Jane", lastName: "Doe", address1: "888 Main St", zip: "77777" },
      orderId: "ord-77",
      orderDescription: "Test order",
      ponumber: "PO-1",
      currency: "USD",
      tax: "1.25",
      shippingAmount: "0.00",
      ipAddress: "203.0.113.7",
      dupSeconds: 120,
      descriptor: { name: "ACME*STORE", phone: "8005550100" },
      initiatedBy: "customer",
      storedCredentialIndicator: "stored",
    });
    const sent = lastRequest();
    expect(sent.get("type")).toBe("sale");
    expect(sent.get("security_key")).toBe(TEST_KEY);
    expect(sent.get("amount")).toBe("49.99");
    expect(sent.get("ccnumber")).toBe("4111111111111111");
    expect(sent.get("ccexp")).toBe("1029");
    expect(sent.get("cvv")).toBe("999");
    expect(sent.get("first_name")).toBe("Jane");
    expect(sent.get("last_name")).toBe("Doe");
    expect(sent.get("address1")).toBe("888 Main St");
    expect(sent.get("city")).toBe("Austin");
    expect(sent.get("state")).toBe("TX");
    expect(sent.get("zip")).toBe("77777");
    expect(sent.get("country")).toBe("US");
    expect(sent.get("email")).toBe("jane@example.com");
    expect(sent.get("phone")).toBe("5125550100");
    expect(sent.get("shipping_firstname")).toBe("Jane");
    expect(sent.get("shipping_lastname")).toBe("Doe");
    expect(sent.get("shipping_address1")).toBe("888 Main St");
    expect(sent.get("shipping_zip")).toBe("77777");
    expect(sent.get("orderid")).toBe("ord-77");
    expect(sent.get("order_description")).toBe("Test order");
    expect(sent.get("ponumber")).toBe("PO-1");
    expect(sent.get("currency")).toBe("USD");
    expect(sent.get("tax")).toBe("1.25");
    expect(sent.get("shipping")).toBe("0.00");
    expect(sent.get("ipaddress")).toBe("203.0.113.7");
    expect(sent.get("dup_seconds")).toBe("120");
    expect(sent.get("descriptor")).toBe("ACME*STORE");
    expect(sent.get("descriptor_phone")).toBe("8005550100");
    expect(sent.get("initiated_by")).toBe("customer");
    expect(sent.get("stored_credential_indicator")).toBe("stored");
  });

  it("supports payment tokens, vault hybrid, and test mode", async () => {
    gw.onTransact(approvedBody({ customer_vault_id: "424242" }));
    const result = await client.transactions.sale({
      amount: "10.00",
      paymentToken: "tok_collectjs",
      vault: { action: "add", id: "424242" },
      testMode: true,
    });
    const sent = lastRequest();
    expect(sent.get("payment_token")).toBe("tok_collectjs");
    expect(sent.get("customer_vault")).toBe("add_customer");
    expect(sent.get("customer_vault_id")).toBe("424242");
    expect(sent.get("test_mode")).toBe("enabled");
    expect(result.ok && result.customerVaultId).toBe("424242");
  });

  it("charges a vaulted customer via customerVaultId", async () => {
    gw.onTransact(approvedBody());
    await client.transactions.sale({ amount: "15.00", customerVaultId: "424242" });
    const sent = lastRequest();
    expect(sent.get("customer_vault_id")).toBe("424242");
    expect(sent.has("ccnumber")).toBe(false);
  });

  it("sends check (ACH) variables with payment=check", async () => {
    gw.onTransact(approvedBody());
    await client.transactions.sale({
      amount: "60.49",
      check: {
        name: "Jane Doe",
        routing: "490000018",
        account: "24413815",
        accountHolderType: "personal",
        accountType: "checking",
        secCode: "WEB",
      },
    });
    const sent = lastRequest();
    expect(sent.get("checkname")).toBe("Jane Doe");
    expect(sent.get("checkaba")).toBe("490000018");
    expect(sent.get("checkaccount")).toBe("24413815");
    expect(sent.get("account_holder_type")).toBe("personal");
    expect(sent.get("account_type")).toBe("checking");
    expect(sent.get("sec_code")).toBe("WEB");
    expect(sent.get("payment")).toBe("check");
  });

  it("returns a typed declined result (never throws on response=2)", async () => {
    gw.onTransact(declinedBody({ response_code: "201", responsetext: "DECLINE" }));
    const result = await client.transactions.sale({ amount: "0.99", paymentToken: "tok" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe(201);
      expect(result.message).toBe("DECLINE");
      expect(result.transactionId).toBe("1234567891");
    }
  });

  it("passes 3DS fields through", async () => {
    gw.onTransact(approvedBody());
    await client.transactions.sale({
      amount: "20.00",
      card: { number: "4111111111111111", expiry: "1029" },
      threeDs: {
        cardholderAuth: "verified",
        cavv: "cavv_b64",
        xid: "xid_b64",
        eci: "05",
        version: "2.2.0",
        directoryServerId: "f25084f0-5b16-4c0a-ae5d-b24808a95e4b",
      },
    });
    const sent = lastRequest();
    expect(sent.get("cardholder_auth")).toBe("verified");
    expect(sent.get("cavv")).toBe("cavv_b64");
    expect(sent.get("xid")).toBe("xid_b64");
    expect(sent.get("eci")).toBe("05");
    expect(sent.get("three_ds_version")).toBe("2.2.0");
    expect(sent.get("directory_server_id")).toBe("f25084f0-5b16-4c0a-ae5d-b24808a95e4b");
  });
});

describe("transactions.authorize / capture", () => {
  it("authorize sends type=auth", async () => {
    gw.onTransact(approvedBody({ type: "auth" }));
    await client.transactions.authorize({ amount: "25.00", paymentToken: "tok" });
    expect(lastRequest().get("type")).toBe("auth");
  });

  it("capture sends type=capture with transactionid and amount", async () => {
    gw.onTransact(approvedBody({ type: "capture" }));
    await client.transactions.capture({
      transactionId: "1234567890",
      amount: "25.00",
      trackingNumber: "1Z999",
      shippingCarrier: "ups",
      orderId: "ord-9",
    });
    const sent = lastRequest();
    expect(sent.get("type")).toBe("capture");
    expect(sent.get("transactionid")).toBe("1234567890");
    expect(sent.get("amount")).toBe("25.00");
    expect(sent.get("tracking_number")).toBe("1Z999");
    expect(sent.get("shipping_carrier")).toBe("ups");
    expect(sent.get("orderid")).toBe("ord-9");
  });
});

describe("transactions.void", () => {
  it("sends type=void with void_reason", async () => {
    gw.onTransact(approvedBody({ type: "void" }));
    await client.transactions.void({ transactionId: "42", reason: "user_cancel" });
    const sent = lastRequest();
    expect(sent.get("type")).toBe("void");
    expect(sent.get("transactionid")).toBe("42");
    expect(sent.get("void_reason")).toBe("user_cancel");
  });

  it("void_reason is optional", async () => {
    gw.onTransact(approvedBody({ type: "void" }));
    await client.transactions.void({ transactionId: "42" });
    expect(lastRequest().has("void_reason")).toBe(false);
  });
});

describe("transactions.refund", () => {
  it("full refund omits amount", async () => {
    gw.onTransact(approvedBody({ type: "refund" }));
    await client.transactions.refund({ transactionId: "42" });
    const sent = lastRequest();
    expect(sent.get("type")).toBe("refund");
    expect(sent.get("transactionid")).toBe("42");
    expect(sent.has("amount")).toBe(false);
  });

  it("partial refund sends the amount", async () => {
    gw.onTransact(approvedBody({ type: "refund" }));
    await client.transactions.refund({ transactionId: "42", amount: "5.00" });
    expect(lastRequest().get("amount")).toBe("5.00");
  });
});

describe("transactions.credit", () => {
  it("sends type=credit", async () => {
    gw.onTransact(approvedBody({ type: "credit" }));
    await client.transactions.credit({
      amount: "12.00",
      card: { number: "4111111111111111", expiry: "1029" },
    });
    expect(lastRequest().get("type")).toBe("credit");
  });
});

describe("transactions.validate", () => {
  it("omits amount entirely (gateway requirement)", async () => {
    gw.onTransact(approvedBody({ type: "validate" }));
    await client.transactions.validate({
      card: { number: "4111111111111111", expiry: "1029", cvv: "999" },
    });
    const sent = lastRequest();
    expect(sent.get("type")).toBe("validate");
    expect(sent.has("amount")).toBe(false);
  });
});

describe("transactions.update", () => {
  it("sends type=update with shipping/order fields", async () => {
    gw.onTransact(approvedBody({ type: "update" }));
    await client.transactions.update({
      transactionId: "42",
      trackingNumber: "1Z000",
      shippingCarrier: "fedex",
      shippingDate: "20260612",
      orderDescription: "updated",
      ponumber: "PO-2",
      customerReceipt: true,
    });
    const sent = lastRequest();
    expect(sent.get("type")).toBe("update");
    expect(sent.get("transactionid")).toBe("42");
    expect(sent.get("tracking_number")).toBe("1Z000");
    expect(sent.get("shipping_carrier")).toBe("fedex");
    expect(sent.get("shipping_date")).toBe("20260612");
    expect(sent.get("order_description")).toBe("updated");
    expect(sent.get("ponumber")).toBe("PO-2");
    expect(sent.get("customer_receipt")).toBe("true");
  });
});

describe("transactions.offline", () => {
  it("sends type=offline with authorization_code", async () => {
    gw.onTransact(approvedBody({ type: "offline" }));
    await client.transactions.offline({
      amount: "30.00",
      authorizationCode: "654321",
      card: { number: "4111111111111111", expiry: "1029" },
    });
    const sent = lastRequest();
    expect(sent.get("type")).toBe("offline");
    expect(sent.get("authorization_code")).toBe("654321");
  });

  it("rejects an empty authorizationCode before sending", async () => {
    await expect(
      client.transactions.offline({
        amount: "30.00",
        authorizationCode: "",
        card: { number: "4111111111111111", expiry: "1029" },
      }),
    ).rejects.toThrow(ValidationError);
    expect(gw.transactRequests).toHaveLength(0);
  });
});

describe("transactions.completePartialPayment", () => {
  it("sends type=complete_partial_payment with partial_payment_id", async () => {
    gw.onTransact(
      approvedBody({
        partial_payment_id: "123456789",
        partial_payment_balance: "0.00",
        amount_authorized: "70.00",
      }),
    );
    const result = await client.transactions.completePartialPayment({
      partialPaymentId: "123456789",
    });
    const sent = lastRequest();
    expect(sent.get("type")).toBe("complete_partial_payment");
    expect(sent.get("partial_payment_id")).toBe("123456789");
    expect(result.ok && result.partialPaymentBalance).toBe("0.00");
    expect(result.ok && result.amountAuthorized).toBe("70.00");
  });
});

describe("partial payments on sale", () => {
  it("passes partial_payments and partial_payment_id", async () => {
    gw.onTransact(approvedBody({ partial_payment_id: "123456789" }));
    await client.transactions.sale({
      amount: "100.00",
      paymentToken: "tok",
      partialPayments: "payment_in_full",
      partialPaymentId: "123456789",
    });
    const sent = lastRequest();
    expect(sent.get("partial_payments")).toBe("payment_in_full");
    expect(sent.get("partial_payment_id")).toBe("123456789");
  });
});

describe("extra escape hatch", () => {
  it("merges raw gateway variables last", async () => {
    gw.onTransact(approvedBody());
    await client.transactions.sale({
      amount: "10.00",
      paymentToken: "tok",
      extra: { surcharge: "0.50", processor_id: "ccprocessora" },
    });
    const sent = lastRequest();
    expect(sent.get("surcharge")).toBe("0.50");
    expect(sent.get("processor_id")).toBe("ccprocessora");
  });
});
