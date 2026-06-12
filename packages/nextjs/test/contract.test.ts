/**
 * Shared endpoint contract: the SAME fixture bodies are asserted against
 * BOTH sides — the route handler's output (@kicbac/nextjs) and the payment
 * form's response parser (@kicbac/react, imported from source via the vitest
 * alias). If either side drifts, this suite fails.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { KicbacDeclineError, postToken } from "@kicbac/react";
import { createKicbacRouteHandler } from "../src/server/index.js";
import type { KicbacServerClient } from "../src/server/index.js";

interface ContractFixture {
  success: { status: number; body: Record<string, unknown> };
  decline: { status: number; body: Record<string, unknown> };
}

const fixture: ContractFixture = JSON.parse(
  readFileSync(fileURLToPath(new URL("./fixtures/endpoint-contract.json", import.meta.url)), "utf8"),
);

function chargeRequest(body: unknown): Request {
  return new Request("http://localhost/api/kicbac", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("route handler produces the contract bodies", () => {
  it("200 success body matches the fixture exactly", async () => {
    const client: KicbacServerClient = {
      transactions: {
        sale: vi.fn().mockResolvedValue({
          ok: true,
          transactionId: "1234560000",
          authCode: "123456",
          raw: { response: "1", responsetext: "SUCCESS", transactionid: "1234560000" },
        }),
      },
    };
    const { POST } = createKicbacRouteHandler({ client, amount: "49.99" });
    const res = await POST(chargeRequest({ token: "tok_contract" }));
    expect(res.status).toBe(fixture.success.status);
    expect(await res.json()).toEqual(fixture.success.body);
  });

  it("402 decline body matches the fixture exactly", async () => {
    const client: KicbacServerClient = {
      transactions: {
        sale: vi.fn().mockResolvedValue({ ok: false, code: 200, message: "DECLINE", raw: {} }),
      },
    };
    const { POST } = createKicbacRouteHandler({ client, amount: "49.99" });
    const res = await POST(chargeRequest({ token: "tok_contract" }));
    expect(res.status).toBe(fixture.decline.status);
    expect(await res.json()).toEqual(fixture.decline.body);
  });
});

describe("@kicbac/react postToken parses the contract bodies", () => {
  it("parses the success body into the onSuccess payload", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(fixture.success.body), {
        status: fixture.success.status,
        headers: { "content-type": "application/json" },
      }),
    );
    const payment = await postToken({
      endpoint: "/api/kicbac",
      token: "tok_contract",
      amount: "49.99",
      fetchImpl,
    });
    expect(payment).toEqual({
      transactionId: "1234560000",
      authCode: "123456",
      amount: "49.99",
      raw: fixture.success.body["raw"],
    });
  });

  it("parses the 402 decline body into KicbacDeclineError {responseCode, responseText}", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(fixture.decline.body), {
        status: fixture.decline.status,
        headers: { "content-type": "application/json" },
      }),
    );
    const error = await postToken({
      endpoint: "/api/kicbac",
      token: "tok_contract",
      fetchImpl,
    }).then(
      () => null,
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(KicbacDeclineError);
    expect((error as KicbacDeclineError).responseCode).toBe(200);
    expect((error as KicbacDeclineError).responseText).toBe("DECLINE");
  });
});
