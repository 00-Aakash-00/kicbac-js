import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  constructEvent,
  SignatureVerificationError,
  ValidationError,
  Webhooks,
  WebhookParseError,
} from "../src/index";

interface Vector {
  name: string;
  signing_key: string;
  payload_base64: string;
  sig_header: string | null;
  expect: "event" | "missing_header" | "format_error" | "signature_mismatch" | "payload_error" | "envelope_error";
  event_type?: string;
  note?: string;
}

const vectorsPath = new URL("../../../openapi/webhooks/vectors.json", import.meta.url);
const file = JSON.parse(readFileSync(vectorsPath, "utf8")) as {
  version: number;
  signing_key: string;
  vectors: Vector[];
};

describe("golden vectors (openapi/webhooks/vectors.json)", () => {
  expect(file.vectors.length).toBeGreaterThan(0);

  describe.for(file.vectors)("$name", (vector) => {
    const bodyBytes = Buffer.from(vector.payload_base64, "base64");

    if (vector.expect === "event") {
      it("verifies and parses (Uint8Array body)", () => {
        const event = constructEvent(
          new Uint8Array(bodyBytes),
          vector.sig_header,
          vector.signing_key,
        );
        expect(event.event_type).toBe(vector.event_type);
        expect(typeof event.event_id).toBe("string");
        expect(event.event_body).toBeTypeOf("object");
      });

      it("verifies and parses (string body)", () => {
        const event = constructEvent(
          bodyBytes.toString("utf8"),
          vector.sig_header,
          vector.signing_key,
        );
        expect(event.event_type).toBe(vector.event_type);
      });
      return;
    }

    if (vector.expect === "missing_header" || vector.expect === "format_error" || vector.expect === "signature_mismatch") {
      it(`throws SignatureVerificationError (${vector.expect})`, () => {
        let caught: unknown;
        try {
          constructEvent(new Uint8Array(bodyBytes), vector.sig_header, vector.signing_key);
        } catch (error) {
          caught = error;
        }
        expect(caught).toBeInstanceOf(SignatureVerificationError);
        expect((caught as SignatureVerificationError).code).toBe(
          "kicbac_signature_verification",
        );
        // No RangeError or other internal error may ever escape.
        expect(caught).not.toBeInstanceOf(RangeError);
      });
      return;
    }

    it(`throws WebhookParseError (${vector.expect})`, () => {
      let caught: unknown;
      try {
        constructEvent(new Uint8Array(bodyBytes), vector.sig_header, vector.signing_key);
      } catch (error) {
        caught = error;
      }
      expect(caught).toBeInstanceOf(WebhookParseError);
      expect(caught).not.toBeInstanceOf(SignatureVerificationError);
    });
  });
});

describe("constructEvent edge cases", () => {
  const valid = file.vectors.find((vector) => vector.expect === "event")!;

  it("empty signingKey -> ValidationError (before touching the header)", () => {
    expect(() =>
      constructEvent(Buffer.from(valid.payload_base64, "base64"), valid.sig_header, ""),
    ).toThrow(ValidationError);
  });

  it("the missing-header error names the header", () => {
    let caught: unknown;
    try {
      constructEvent("{}", null, "some_key");
    } catch (error) {
      caught = error;
    }
    expect((caught as Error).message).toContain("Webhook-Signature");
    expect((caught as SignatureVerificationError).header).toBeNull();
  });

  it("the malformed error keeps the offending header for diagnostics", () => {
    let caught: unknown;
    try {
      constructEvent("{}", "garbage", "some_key");
    } catch (error) {
      caught = error;
    }
    expect((caught as SignatureVerificationError).header).toBe("garbage");
  });

  it("surrounding whitespace in the header is tolerated", () => {
    const event = constructEvent(
      Buffer.from(valid.payload_base64, "base64"),
      `  ${valid.sig_header}  `,
      valid.signing_key,
    );
    expect(event.event_type).toBe(valid.event_type);
  });

  it("Webhooks class delegates to constructEvent", () => {
    const webhooks = new Webhooks();
    const event = webhooks.constructEvent(
      Buffer.from(valid.payload_base64, "base64"),
      valid.sig_header,
      valid.signing_key,
    );
    expect(event.event_type).toBe(valid.event_type);
  });

  it("a Uint8Array view with a byteOffset verifies correctly", () => {
    const bodyBytes = Buffer.from(valid.payload_base64, "base64");
    const padded = Buffer.concat([Buffer.from("xxxx"), bodyBytes, Buffer.from("yyyy")]);
    const view = new Uint8Array(
      padded.buffer,
      padded.byteOffset + 4,
      bodyBytes.byteLength,
    );
    const event = constructEvent(view, valid.sig_header, valid.signing_key);
    expect(event.event_type).toBe(valid.event_type);
  });
});

describe("attacker-controlled header hardening", () => {
  const valid = file.vectors.find((vector) => vector.expect === "event")!;
  const body = Buffer.from(valid.payload_base64, "base64");

  it("rejects an oversized header without storing it on the error", () => {
    const huge = `t=${"a".repeat(1_000_000)},s=${"ab".repeat(32)}`;
    let caught: unknown;
    try {
      constructEvent(body, huge, valid.signing_key);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(SignatureVerificationError);
    expect((caught as SignatureVerificationError).header).toBeNull();
    expect((caught as Error).message).not.toContain("aaaa");
  });

  it("rejects a nonce containing control characters (newline)", () => {
    expect(() =>
      constructEvent(body, `t=abc\ndef,s=${"ab".repeat(32)}`, valid.signing_key),
    ).toThrow(SignatureVerificationError);
  });

  it("rejects a nonce containing a null byte", () => {
    expect(() =>
      constructEvent(body, `t=abc\0def,s=${"ab".repeat(32)}`, valid.signing_key),
    ).toThrow(SignatureVerificationError);
  });

  it("rejects a nonce longer than 256 characters", () => {
    expect(() =>
      constructEvent(body, `t=${"a".repeat(257)},s=${"ab".repeat(32)}`, valid.signing_key),
    ).toThrow(SignatureVerificationError);
  });

  it("accepts a 256-character nonce when correctly signed", () => {
    const { createHmac } = require("node:crypto") as typeof import("node:crypto");
    const nonce = "a".repeat(256);
    const sig = createHmac("sha256", valid.signing_key)
      .update(Buffer.concat([Buffer.from(`${nonce}.`), body]))
      .digest("hex");
    const event = constructEvent(body, `t=${nonce},s=${sig}`, valid.signing_key);
    expect(event.event_type).toBe(valid.event_type);
  });
});
