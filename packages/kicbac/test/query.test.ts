import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import Kicbac, { AuthenticationError, GatewayError, ParseError } from "../src/index";
import { createGateway, TEST_KEY } from "./helpers/gateway";

const gw = createGateway();
beforeAll(() => gw.server.listen({ onUnhandledRequest: "error" }));
afterEach(() => {
  gw.server.resetHandlers();
  gw.reset();
});
afterAll(() => gw.server.close());

const client = new Kicbac({ securityKey: TEST_KEY });

function transactionsXml(ids: number[]): string {
  const items = ids
    .map(
      (id) =>
        `<transaction><transaction_id>${id}</transaction_id><condition>complete</condition><action><action_type>sale</action_type><success>1</success></action></transaction>`,
    )
    .join("");
  return `<nm_response>${items}</nm_response>`;
}

async function collect<T>(iterator: AsyncIterableIterator<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const item of iterator) out.push(item);
  return out;
}

describe("pagination", () => {
  it("walks page_number 0..n with result_limit and stops on a short page", async () => {
    gw.onQuery({ body: transactionsXml([1, 2]) }); // full page (pageSize 2)
    gw.onQuery({ body: transactionsXml([3, 4]) }); // full page
    gw.onQuery({ body: transactionsXml([5]) }); // short page -> stop
    const records = await collect(client.query.transactions({ pageSize: 2 }));
    expect(records.map((r) => r["transaction_id"])).toEqual(["1", "2", "3", "4", "5"]);
    expect(gw.queryRequests).toHaveLength(3);
    expect(gw.queryRequests.map((p) => p.get("page_number"))).toEqual(["0", "1", "2"]);
    expect(gw.queryRequests.every((p) => p.get("result_limit") === "2")).toBe(true);
    expect(gw.queryRequests.every((p) => p.get("security_key") === TEST_KEY)).toBe(true);
  });

  it("a final exactly-full page triggers one extra empty request", async () => {
    gw.onQuery({ body: transactionsXml([1, 2]) });
    gw.onQuery({ body: "<nm_response></nm_response>" });
    const records = await collect(client.query.transactions({ pageSize: 2 }));
    expect(records).toHaveLength(2);
    expect(gw.queryRequests).toHaveLength(2);
  });

  it("an empty <nm_response> yields an empty iterator", async () => {
    gw.onQuery({ body: "<nm_response></nm_response>" });
    const records = await collect(client.query.transactions());
    expect(records).toEqual([]);
    expect(gw.queryRequests).toHaveLength(1);
    expect(gw.queryRequests[0]!.get("result_limit")).toBe("100");
  });
});

describe("filters", () => {
  it("joins condition/actionType/source arrays with commas", async () => {
    gw.onQuery({ body: "<nm_response></nm_response>" });
    await collect(
      client.query.transactions({
        condition: ["pendingsettlement", "complete"],
        actionType: ["sale", "refund"],
        source: ["api", "recurring"],
        transactionType: "cc",
        transactionId: ["111", "222"],
        firstName: "Jess",
        ccNumber: "1111",
      }),
    );
    const sent = gw.queryRequests[0]!;
    expect(sent.get("condition")).toBe("pendingsettlement,complete");
    expect(sent.get("action_type")).toBe("sale,refund");
    expect(sent.get("source")).toBe("api,recurring");
    expect(sent.get("transaction_type")).toBe("cc");
    expect(sent.get("transaction_id")).toBe("111,222");
    expect(sent.get("first_name")).toBe("Jess");
    expect(sent.get("cc_number")).toBe("1111");
  });

  it("customers/subscriptions/plans/invoices set their report_type", async () => {
    gw.onQuery({
      body: "<nm_response><customer_vault><customer><customer_vault_id>5</customer_vault_id></customer></customer_vault></nm_response>",
    });
    const customers = await collect(client.query.customers({ customerVaultId: "5" }));
    expect(customers[0]!["customer_vault_id"]).toBe("5");
    expect(gw.queryRequests[0]!.get("report_type")).toBe("customer_vault");
    expect(gw.queryRequests[0]!.get("customer_vault_id")).toBe("5");

    gw.onQuery({
      body: "<nm_response><subscription><subscription_id>9</subscription_id><plan><plan_id>p</plan_id></plan></subscription></nm_response>",
    });
    const subs = await collect(client.query.subscriptions());
    expect(subs[0]!["subscription_id"]).toBe("9");
    expect(subs[0]!["plan"]).toMatchObject({ plan_id: "p" });
    expect(gw.queryRequests[1]!.get("report_type")).toBe("recurring");

    gw.onQuery({ body: "<nm_response><plan><plan_id>p1</plan_id></plan></nm_response>" });
    const plans = await collect(client.query.plans());
    expect(plans[0]!["plan_id"]).toBe("p1");
    expect(gw.queryRequests[2]!.get("report_type")).toBe("recurring_plans");

    gw.onQuery({
      body: "<nm_response><invoice><invoice_id>i1</invoice_id></invoice></nm_response>",
    });
    const invoices = await collect(client.query.invoices({ invoiceStatus: ["open", "past_due"] }));
    expect(invoices[0]!["invoice_id"]).toBe("i1");
    expect(gw.queryRequests[3]!.get("report_type")).toBe("invoicing");
    expect(gw.queryRequests[3]!.get("invoice_status")).toBe("open,past_due");
  });
});

describe("error handling", () => {
  it("<error_response> matching the auth pattern -> AuthenticationError", async () => {
    gw.onQuery({
      body: "<nm_response><error_response>Authentication Failed</error_response></nm_response>",
    });
    await expect(collect(client.query.transactions())).rejects.toBeInstanceOf(AuthenticationError);
  });

  it("other <error_response> -> GatewayError with the text", async () => {
    gw.onQuery({
      body: "<nm_response><error_response>Invalid date range</error_response></nm_response>",
    });
    let caught: unknown;
    try {
      await collect(client.query.transactions());
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(GatewayError);
    expect(caught).not.toBeInstanceOf(AuthenticationError);
    expect((caught as GatewayError).responseText).toBe("Invalid date range");
  });

  it("malformed XML -> ParseError", async () => {
    gw.onQuery({ body: "<nm_response><transaction><oops></nm_response>" });
    await expect(collect(client.query.transactions())).rejects.toBeInstanceOf(ParseError);
  });
});

describe("query.raw", () => {
  it("returns the raw XML body for arbitrary report types", async () => {
    const xml = "<nm_response><protected>false</protected></nm_response>";
    gw.onQuery({ body: xml });
    const text = await client.query.raw({ report_type: "profile", processor_details: "true" });
    expect(text).toBe(xml);
    const sent = gw.queryRequests[0]!;
    expect(sent.get("report_type")).toBe("profile");
    expect(sent.get("security_key")).toBe(TEST_KEY);
  });
});
