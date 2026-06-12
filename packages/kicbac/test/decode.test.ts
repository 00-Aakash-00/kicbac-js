import { describe, expect, it } from "vitest";
import { decodeTransactResponse, emptyToNull, intOrNull } from "../src/decode";
import { ParseError } from "../src/errors";
import { toTransactionResult } from "../src/resources/transactions";
import { approvedBody, formBody } from "./helpers/gateway";

describe("decodeTransactResponse", () => {
  it("decodes a happy-path approved body", () => {
    const raw = decodeTransactResponse(approvedBody(), "text/html");
    expect(raw["response"]).toBe("1");
    expect(raw["responsetext"]).toBe("SUCCESS");
    expect(raw["transactionid"]).toBe("1234567890");
    expect(raw["response_code"]).toBe("100");
  });

  it("throws ParseError on an empty body", () => {
    expect(() => decodeTransactResponse("", "text/html")).toThrow(ParseError);
    expect(() => decodeTransactResponse("   \n", "text/html")).toThrow(ParseError);
  });

  it("throws ParseError on HTML garbage", () => {
    let caught: unknown;
    try {
      decodeTransactResponse("<html><body><h1>502 Bad Gateway</h1></body></html>", "text/html");
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(ParseError);
    const parseError = caught as ParseError;
    expect(parseError.bodySnippet).toContain("502 Bad Gateway");
    expect(parseError.contentType).toBe("text/html");
    expect(parseError.code).toBe("kicbac_parse");
  });

  it("throws ParseError when response is out of range (response=7)", () => {
    expect(() =>
      decodeTransactResponse(formBody({ response: "7", responsetext: "?" }), "text/html"),
    ).toThrow(ParseError);
  });

  it("keeps unknown keys verbatim in raw", () => {
    const raw = decodeTransactResponse(
      approvedBody({ some_future_field: "value42" }),
      "text/html",
    );
    expect(raw["some_future_field"]).toBe("value42");
  });
});

describe("result mapping", () => {
  it("normalizes '' to null in typed fields, keeps raw verbatim", () => {
    const raw = decodeTransactResponse(
      approvedBody({ avsresponse: "", cvvresponse: "", orderid: "", authcode: "" }),
      "text/html",
    );
    const result = toTransactionResult(raw);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.avsResponse).toBeNull();
      expect(result.cvvResponse).toBeNull();
      expect(result.orderId).toBeNull();
      expect(result.authCode).toBeNull();
      expect(result.customerVaultId).toBeNull();
      expect(result.partialPaymentId).toBeNull();
      expect(result.raw["avsresponse"]).toBe("");
      expect(result.raw["orderid"]).toBe("");
    }
  });

  it("maps approved fields", () => {
    const raw = decodeTransactResponse(
      approvedBody({
        customer_vault_id: "987",
        partial_payment_id: "555",
        partial_payment_balance: "70.00",
        amount_authorized: "30.00",
        orderid: "ord-1",
      }),
      "text/html",
    );
    const result = toTransactionResult(raw);
    expect(result).toMatchObject({
      ok: true,
      transactionId: "1234567890",
      authCode: "123456",
      responseCode: 100,
      responseText: "SUCCESS",
      avsResponse: "N",
      cvvResponse: "M",
      orderId: "ord-1",
      customerVaultId: "987",
      partialPaymentId: "555",
      partialPaymentBalance: "70.00",
      amountAuthorized: "30.00",
    });
  });
});

describe("normalization helpers", () => {
  it("emptyToNull", () => {
    expect(emptyToNull("")).toBeNull();
    expect(emptyToNull(undefined)).toBeNull();
    expect(emptyToNull("x")).toBe("x");
  });

  it("intOrNull", () => {
    expect(intOrNull("100")).toBe(100);
    expect(intOrNull("")).toBeNull();
    expect(intOrNull(undefined)).toBeNull();
    expect(intOrNull("abc")).toBeNull();
  });
});
