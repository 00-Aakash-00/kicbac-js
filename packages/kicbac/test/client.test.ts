import { readFileSync } from "node:fs";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { http, HttpResponse } from "msw";
import Kicbac, { AVS_CODES, CVV_CODES, RESPONSE_CODES } from "../src/index";
import { approvedBody, createGateway, TEST_KEY } from "./helpers/gateway";

const gw = createGateway();
beforeAll(() => gw.server.listen({ onUnhandledRequest: "error" }));
afterEach(() => {
  gw.server.resetHandlers();
  gw.reset();
  vi.unstubAllEnvs();
});
afterAll(() => gw.server.close());

describe("config resolution", () => {
  it("auto-reads KICBAC_SECURITY_KEY from the environment", async () => {
    vi.stubEnv("KICBAC_SECURITY_KEY", "env_key_999");
    const client = new Kicbac();
    gw.onTransact(approvedBody());
    await client.transactions.sale({ amount: "10.00", paymentToken: "tok" });
    expect(gw.transactRequests[0]!.get("security_key")).toBe("env_key_999");
  });

  it("an explicit securityKey wins over the environment", async () => {
    vi.stubEnv("KICBAC_SECURITY_KEY", "env_key_999");
    const client = new Kicbac({ securityKey: "explicit_key" });
    gw.onTransact(approvedBody());
    await client.transactions.sale({ amount: "10.00", paymentToken: "tok" });
    expect(gw.transactRequests[0]!.get("security_key")).toBe("explicit_key");
  });

  it("baseUrl override targets the custom origin", async () => {
    let receivedKey: string | null = null;
    gw.server.use(
      http.post("https://sandbox.example.test/api/transact.php", async ({ request }) => {
        receivedKey = new URLSearchParams(await request.text()).get("security_key");
        return new HttpResponse(approvedBody(), {
          status: 200,
          headers: { "content-type": "text/html" },
        });
      }),
    );
    const client = new Kicbac({
      securityKey: TEST_KEY,
      baseUrl: "https://sandbox.example.test/",
    });
    const result = await client.transactions.sale({ amount: "10.00", paymentToken: "tok" });
    expect(result.ok).toBe(true);
    expect(receivedKey).toBe(TEST_KEY);
    expect(gw.transactRequests).toHaveLength(0); // default origin untouched
  });

  it("a custom fetch implementation is used", async () => {
    const fetchSpy = vi.fn(() =>
      Promise.resolve(
        new Response(approvedBody(), { status: 200, headers: { "content-type": "text/html" } }),
      ),
    );
    const client = new Kicbac({ securityKey: TEST_KEY, fetch: fetchSpy as never });
    const result = await client.transactions.sale({ amount: "10.00", paymentToken: "tok" });
    expect(result.ok).toBe(true);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0] as unknown as [string, RequestInit];
    expect(String(url)).toBe("https://kicbac.transactiongateway.com/api/transact.php");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>)["content-type"]).toBe(
      "application/x-www-form-urlencoded",
    );
    expect(gw.transactRequests).toHaveLength(0); // msw never hit
  });

  it("exposes all resources", () => {
    const client = new Kicbac({ securityKey: TEST_KEY });
    expect(client.transactions).toBeDefined();
    expect(client.customers).toBeDefined();
    expect(client.plans).toBeDefined();
    expect(client.subscriptions).toBeDefined();
    expect(client.invoices).toBeDefined();
    expect(client.query).toBeDefined();
    expect(client.webhooks).toBeDefined();
  });
});

describe("code table parity with openapi/data", () => {
  it("RESPONSE_CODES matches response-codes.json on disk", () => {
    const onDisk = JSON.parse(
      readFileSync(new URL("../../../openapi/data/response-codes.json", import.meta.url), "utf8"),
    ) as { codes: unknown };
    expect(RESPONSE_CODES).toEqual(onDisk.codes);
  });

  it("AVS_CODES / CVV_CODES match the JSON fixtures on disk", () => {
    const avs = JSON.parse(
      readFileSync(new URL("../../../openapi/data/avs-codes.json", import.meta.url), "utf8"),
    ) as { codes: unknown };
    const cvv = JSON.parse(
      readFileSync(new URL("../../../openapi/data/cvv-codes.json", import.meta.url), "utf8"),
    ) as { codes: unknown };
    expect(AVS_CODES).toEqual(avs.codes);
    expect(CVV_CODES).toEqual(cvv.codes);
  });
});
