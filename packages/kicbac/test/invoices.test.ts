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

describe("invoices.create", () => {
  it("sends invoicing=add_invoice with amount/email and options", async () => {
    gw.onTransact(approvedBody({ responsetext: "Invoice Added", invoice_id: "inv-100" }));
    const result = await client.invoices.create({
      amount: "150.00",
      email: "customer@example.com",
      paymentTerms: 30,
      paymentMethodsAllowed: ["cc", "ck"],
      orderDescription: "Consulting",
      billing: { firstName: "Jess", lastName: "Jones" },
      shipping: { firstName: "Jess", lastName: "Jones" },
    });
    const sent = lastRequest();
    expect(sent.get("invoicing")).toBe("add_invoice");
    expect(sent.get("amount")).toBe("150.00");
    expect(sent.get("email")).toBe("customer@example.com");
    expect(sent.get("payment_terms")).toBe("30");
    expect(sent.get("payment_methods_allowed")).toBe("cc,ck");
    expect(sent.get("order_description")).toBe("Consulting");
    expect(sent.get("first_name")).toBe("Jess");
    expect(sent.get("shipping_firstname")).toBe("Jess");
    expect(result.ok && result.invoiceId).toBe("inv-100");
  });

  it('paymentTerms "upon_receipt" passes through verbatim', async () => {
    gw.onTransact(approvedBody({ invoice_id: "inv-101" }));
    await client.invoices.create({
      amount: "10.00",
      email: "c@example.com",
      paymentTerms: "upon_receipt",
    });
    expect(lastRequest().get("payment_terms")).toBe("upon_receipt");
  });

  it("amount must be greater than zero", async () => {
    await expect(
      client.invoices.create({ amount: "0.00", email: "c@example.com" }),
    ).rejects.toThrow(ValidationError);
    expect(gw.transactRequests).toHaveLength(0);
  });

  it("email is required", async () => {
    await expect(client.invoices.create({ amount: "10.00", email: "" })).rejects.toThrow(
      ValidationError,
    );
  });
});

describe("invoices.update / send / close", () => {
  it("update sends invoicing=update_invoice with invoice_id", async () => {
    gw.onTransact(approvedBody({ invoice_id: "inv-100" }));
    await client.invoices.update({ invoiceId: "inv-100", amount: "175.00" });
    const sent = lastRequest();
    expect(sent.get("invoicing")).toBe("update_invoice");
    expect(sent.get("invoice_id")).toBe("inv-100");
    expect(sent.get("amount")).toBe("175.00");
  });

  it("send sends invoicing=send_invoice", async () => {
    gw.onTransact(approvedBody({ invoice_id: "inv-100" }));
    const result = await client.invoices.send("inv-100");
    const sent = lastRequest();
    expect(sent.get("invoicing")).toBe("send_invoice");
    expect(sent.get("invoice_id")).toBe("inv-100");
    expect(result.ok && result.invoiceId).toBe("inv-100");
  });

  it("close sends invoicing=close_invoice", async () => {
    gw.onTransact(approvedBody({ invoice_id: "inv-100" }));
    await client.invoices.close("inv-100");
    const sent = lastRequest();
    expect(sent.get("invoicing")).toBe("close_invoice");
    expect(sent.get("invoice_id")).toBe("inv-100");
  });

  it("invoiceId is null when the gateway omits invoice_id", async () => {
    gw.onTransact(approvedBody());
    const result = await client.invoices.send("inv-100");
    expect(result.ok && result.invoiceId).toBeNull();
  });
});
