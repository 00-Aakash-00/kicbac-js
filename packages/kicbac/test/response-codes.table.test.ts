import { readFileSync } from "node:fs";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import Kicbac, {
  AuthenticationError,
  GatewayError,
  InvalidRequestError,
  KicbacError,
  ProcessorError,
  RateLimitError,
} from "../src/index";
import { createGateway, formBody, TEST_KEY } from "./helpers/gateway";

interface CodeRow {
  code: number;
  text: string;
  response: 1 | 2 | 3;
  outcome: "approved" | "declined" | "error";
  error_class?: string;
}

const fixturePath = new URL("../../../openapi/data/response-codes.json", import.meta.url);
const fixture = JSON.parse(readFileSync(fixturePath, "utf8")) as {
  codes: CodeRow[];
  auth_failure_pattern: string;
};

const gw = createGateway();
beforeAll(() => gw.server.listen({ onUnhandledRequest: "error" }));
afterEach(() => {
  gw.server.resetHandlers();
  gw.reset();
});
afterAll(() => gw.server.close());

const client = new Kicbac({ securityKey: TEST_KEY });

const ERROR_CLASSES: Record<string, unknown> = {
  InvalidRequestError,
  RateLimitError,
  ProcessorError,
};

function bodyFor(row: CodeRow): string {
  return formBody({
    response: String(row.response),
    responsetext: row.text,
    authcode: row.response === 1 ? "123456" : "",
    transactionid: row.response === 3 ? "" : "9876543210",
    avsresponse: "",
    cvvresponse: "",
    orderid: "",
    type: "sale",
    response_code: String(row.code),
  });
}

describe("every row of openapi/data/response-codes.json", () => {
  it.for(fixture.codes)("code $code -> $outcome", async (row) => {
    gw.onTransact(bodyFor(row));
    const promise = client.transactions.sale({ amount: "49.99", paymentToken: "tok" });

    if (row.outcome === "approved") {
      const result = await promise;
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.responseCode).toBe(row.code);
        expect(result.responseText).toBe(row.text);
      }
      return;
    }

    if (row.outcome === "declined") {
      const result = await promise;
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe(row.code);
        expect(result.message).toBe(row.text);
      }
      return;
    }

    // outcome === "error": thrown, with the exact taxonomy class.
    let caught: unknown;
    try {
      await promise;
    } catch (error) {
      caught = error;
    }
    expect(caught, `code ${row.code} must throw`).toBeDefined();
    expect(KicbacError.isKicbacError(caught)).toBe(true);
    const expectedClass = ERROR_CLASSES[row.error_class as string];
    expect(expectedClass, `unknown error_class ${row.error_class}`).toBeDefined();
    expect(caught).toBeInstanceOf(expectedClass);
    expect((caught as Error).constructor.name).toBe(row.error_class);

    if (caught instanceof RateLimitError) {
      expect(caught.httpStatus).toBe(200);
      expect(caught.responseCode).toBe(301);
    } else {
      expect(caught).toBeInstanceOf(GatewayError);
      expect((caught as GatewayError).responseCode).toBe(row.code);
      expect((caught as GatewayError).responseText).toBe(row.text);
    }
  });

  it("code 300 with auth-failure text -> AuthenticationError (not InvalidRequestError)", async () => {
    gw.onTransact(
      formBody({
        response: "3",
        responsetext: "Authentication Failed",
        authcode: "",
        transactionid: "",
        avsresponse: "",
        cvvresponse: "",
        orderid: "",
        type: "",
        response_code: "300",
      }),
    );
    let caught: unknown;
    try {
      await client.transactions.sale({ amount: "49.99", paymentToken: "tok" });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(AuthenticationError);
    expect((caught as AuthenticationError).responseCode).toBe(300);
    expect((caught as AuthenticationError).code).toBe("kicbac_authentication");
  });

  it("the auth pattern is applied case-insensitively", async () => {
    gw.onTransact(
      formBody({ response: "3", responsetext: "INVALID SECURITY KEY", response_code: "300" }),
    );
    await expect(
      client.transactions.sale({ amount: "49.99", paymentToken: "tok" }),
    ).rejects.toBeInstanceOf(AuthenticationError);
  });
});
