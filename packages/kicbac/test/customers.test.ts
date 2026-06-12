import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import Kicbac, { ValidationError } from "../src/index";
import { approvedBody, createGateway, TEST_KEY } from "./helpers/gateway";

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

describe("customers.create", () => {
  it("sends customer_vault=add_customer with payment and addresses", async () => {
    gw.onTransact(approvedBody({ responsetext: "Customer Added", customer_vault_id: "31415" }));
    const result = await client.customers.create({
      paymentToken: "tok_collectjs",
      billing: { firstName: "Jess", lastName: "Jones", zip: "12345" },
      shipping: { firstName: "Jess", lastName: "Jones", phone: "5551234567" },
      orderDescription: "vaulted",
      acuEnabled: false,
    });
    const sent = lastRequest();
    expect(sent.get("customer_vault")).toBe("add_customer");
    expect(sent.get("payment_token")).toBe("tok_collectjs");
    expect(sent.get("first_name")).toBe("Jess");
    expect(sent.get("zip")).toBe("12345");
    expect(sent.get("shipping_firstname")).toBe("Jess");
    expect(sent.get("shipping_phone")).toBe("5551234567");
    expect(sent.get("order_description")).toBe("vaulted");
    expect(sent.get("acu_enabled")).toBe("false");
    expect(result.ok && result.customerVaultId).toBe("31415");
  });

  it("can assign a specific customer_vault_id", async () => {
    gw.onTransact(approvedBody({ customer_vault_id: "my-id-1" }));
    await client.customers.create({
      customerVaultId: "my-id-1",
      card: { number: "4111111111111111", expiry: "1029" },
    });
    expect(lastRequest().get("customer_vault_id")).toBe("my-id-1");
  });

  it("requires exactly one payment method", async () => {
    await expect(client.customers.create({})).rejects.toThrow(ValidationError);
    expect(gw.transactRequests).toHaveLength(0);
  });

  it("accepts sourceTransactionId as the payment source", async () => {
    gw.onTransact(approvedBody({ customer_vault_id: "8" }));
    await client.customers.create({ sourceTransactionId: "987654" });
    expect(lastRequest().get("source_transaction_id")).toBe("987654");
  });
});

describe("customers.update / delete", () => {
  it("update sends customer_vault=update_customer with the id", async () => {
    gw.onTransact(approvedBody({ responsetext: "Customer Update Successful", customer_vault_id: "31415" }));
    await client.customers.update({
      customerVaultId: "31415",
      billing: { address1: "1 New Road" },
    });
    const sent = lastRequest();
    expect(sent.get("customer_vault")).toBe("update_customer");
    expect(sent.get("customer_vault_id")).toBe("31415");
    expect(sent.get("address1")).toBe("1 New Road");
  });

  it("delete sends customer_vault=delete_customer", async () => {
    gw.onTransact(approvedBody({ responsetext: "Customer Deleted" }));
    await client.customers.delete("31415");
    const sent = lastRequest();
    expect(sent.get("customer_vault")).toBe("delete_customer");
    expect(sent.get("customer_vault_id")).toBe("31415");
  });
});

describe("customers.charge", () => {
  it("charges the vault with type=sale and CIT/MIT fields", async () => {
    gw.onTransact(approvedBody({ customer_vault_id: "31415" }));
    const result = await client.customers.charge({
      customerVaultId: "31415",
      amount: "49.99",
      initiatedBy: "merchant",
      storedCredentialIndicator: "used",
      initialTransactionId: "111222333",
      billingMethod: "recurring",
      orderId: "ord-5",
    });
    const sent = lastRequest();
    expect(sent.get("type")).toBe("sale");
    expect(sent.get("customer_vault_id")).toBe("31415");
    expect(sent.get("amount")).toBe("49.99");
    expect(sent.get("initiated_by")).toBe("merchant");
    expect(sent.get("stored_credential_indicator")).toBe("used");
    expect(sent.get("initial_transaction_id")).toBe("111222333");
    expect(sent.get("billing_method")).toBe("recurring");
    expect(sent.get("orderid")).toBe("ord-5");
    expect(result.ok).toBe(true);
  });

  it("can authorize instead of sale", async () => {
    gw.onTransact(approvedBody({ type: "auth" }));
    await client.customers.charge({ customerVaultId: "31415", amount: "10.00", type: "auth" });
    expect(lastRequest().get("type")).toBe("auth");
  });

  it("validates the amount before sending", async () => {
    await expect(
      client.customers.charge({ customerVaultId: "31415", amount: "1,000.00" }),
    ).rejects.toThrow(ValidationError);
    expect(gw.transactRequests).toHaveLength(0);
  });
});

describe("billing records", () => {
  it("addBilling sends customer_vault=add_billing", async () => {
    gw.onTransact(approvedBody({ responsetext: "Billing Added", customer_vault_id: "31415" }));
    await client.customers.addBilling({
      customerVaultId: "31415",
      billingId: "b2",
      card: { number: "5431111111111111", expiry: "1029" },
      billing: { firstName: "Jess" },
    });
    const sent = lastRequest();
    expect(sent.get("customer_vault")).toBe("add_billing");
    expect(sent.get("customer_vault_id")).toBe("31415");
    expect(sent.get("billing_id")).toBe("b2");
    expect(sent.get("ccnumber")).toBe("5431111111111111");
    expect(sent.get("first_name")).toBe("Jess");
  });

  it("updateBilling sends customer_vault=update_billing and requires billingId", async () => {
    gw.onTransact(approvedBody({ responsetext: "Billing Updated" }));
    await client.customers.updateBilling({
      customerVaultId: "31415",
      billingId: "b2",
      billing: { zip: "99999" },
    });
    const sent = lastRequest();
    expect(sent.get("customer_vault")).toBe("update_billing");
    expect(sent.get("billing_id")).toBe("b2");
    expect(sent.get("zip")).toBe("99999");
  });

  it("deleteBilling sends customer_vault=delete_billing", async () => {
    gw.onTransact(approvedBody({ responsetext: "Billing Deleted" }));
    await client.customers.deleteBilling({ customerVaultId: "31415", billingId: "b2" });
    const sent = lastRequest();
    expect(sent.get("customer_vault")).toBe("delete_billing");
    expect(sent.get("customer_vault_id")).toBe("31415");
    expect(sent.get("billing_id")).toBe("b2");
  });
});
