// Generates openapi/webhooks/vectors.json — golden vectors for webhook signature
// verification, consumed by BOTH the Node and Python SDK test suites.
// Deterministic: fixed signing keys and nonces. Run: node openapi/scripts/make-vectors.mjs
import { createHmac } from "node:crypto";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const examplePath = process.env.KICBAC_WEBHOOK_EXAMPLE ?? "";
const existingVectorsPath = join(here, "..", "webhooks", "vectors.json");

const SIGNING_KEY = "whsec_test_kicbac_8675309";
const WRONG_KEY = "whsec_wrong_key_0000000";

function sign(key, nonce, bodyBytes) {
  return createHmac("sha256", key)
    .update(Buffer.concat([Buffer.from(`${nonce}.`, "utf8"), bodyBytes]))
    .digest("hex");
}

function vector(name, { key = SIGNING_KEY, nonce, body, header, expect, eventType, note }) {
  const bodyBytes = Buffer.isBuffer(body) ? body : Buffer.from(body, "utf8");
  const sigHeader =
    header !== undefined ? header : `t=${nonce},s=${sign(key, nonce, bodyBytes)}`;
  return {
    name,
    signing_key: SIGNING_KEY,
    payload_base64: bodyBytes.toString("base64"),
    sig_header: sigHeader,
    expect,
    ...(eventType ? { event_type: eventType } : {}),
    ...(note ? { note } : {}),
  };
}

// Real payload from the gateway docs (file has a title line before the JSON
// and a field-reference section after it) — extract the balanced JSON object.
function extractJsonObject(text) {
  const start = text.indexOf("{");
  let depth = 0;
  let inString = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (ch === "\\") i++;
      else if (ch === '"') inString = false;
    } else if (ch === '"') inString = true;
    else if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  throw new Error("no balanced JSON object found");
}

const realPayload = examplePath && existsSync(examplePath)
  ? JSON.parse(extractJsonObject(readFileSync(examplePath, "utf8")))
  : JSON.parse(
      Buffer.from(
        JSON.parse(readFileSync(existingVectorsPath, "utf8")).vectors.find(
          (item) => item.name === "valid-real-transaction-sale-success",
        ).payload_base64,
        "base64",
      ).toString("utf8"),
    );
if (realPayload.event_type !== "transaction.sale.success") {
  throw new Error("unexpected example payload");
}
const realCompact = JSON.stringify(realPayload);

const unicodePayload = JSON.stringify(
  {
    event_id: "11111111-2222-3333-4444-555555555555",
    event_type: "transaction.sale.success",
    event_body: {
      merchant: { id: "1234", name: "Müller & Söhne — 日本語 <tags> & a=b" },
      features: { is_test_mode: true },
      transaction_id: "9999999999",
      order_description: 'quotes "and" backslashes \\ and slashes /',
    },
  },
  null,
  2,
);

const vectors = [];

vectors.push(
  vector("valid-real-transaction-sale-success", {
    nonce: "a1b2c3d4e5f60718",
    body: realCompact,
    expect: "event",
    eventType: "transaction.sale.success",
  }),
  vector("valid-pretty-unicode-body", {
    nonce: "ffeeddccbbaa0099",
    body: unicodePayload,
    expect: "event",
    eventType: "transaction.sale.success",
    note: "pretty-printed body with multi-byte UTF-8, &, =, quotes — exact-bytes verification",
  }),
  vector("valid-trailing-newline", {
    nonce: "0102030405060708",
    body: realCompact + "\n",
    expect: "event",
    eventType: "transaction.sale.success",
    note: "trailing newline is part of the signed bytes",
  }),
);

{
  const nonce = "cafebabe12345678";
  const bodyBytes = Buffer.from(realCompact, "utf8");
  const sig = sign(SIGNING_KEY, nonce, bodyBytes);
  vectors.push(
    vector("valid-uppercase-hex-signature", {
      nonce,
      body: realCompact,
      header: `t=${nonce},s=${sig.toUpperCase()}`,
      expect: "event",
      eventType: "transaction.sale.success",
      note: "hex signature case-insensitive",
    }),
  );

  const tampered = Buffer.from(bodyBytes);
  tampered[tampered.length - 2] = tampered[tampered.length - 2] === 0x7d ? 0x5d : 0x7d;
  vectors.push({
    name: "tampered-body",
    signing_key: SIGNING_KEY,
    payload_base64: tampered.toString("base64"),
    sig_header: `t=${nonce},s=${sig}`,
    expect: "signature_mismatch",
  });
}

vectors.push(
  vector("wrong-signing-key", {
    key: WRONG_KEY,
    nonce: "deadbeefdeadbeef",
    body: realCompact,
    expect: "signature_mismatch",
    note: "signed with a different key; verify against signing_key fails",
  }),
  vector("missing-header-null", {
    nonce: "n/a",
    body: realCompact,
    header: null,
    expect: "missing_header",
  }),
  vector("missing-header-empty", {
    nonce: "n/a",
    body: realCompact,
    header: "",
    expect: "missing_header",
  }),
  vector("malformed-no-signature-part", {
    nonce: "n/a",
    body: realCompact,
    header: "t=abcdef",
    expect: "format_error",
  }),
  vector("malformed-swapped-order", {
    nonce: "n/a",
    body: realCompact,
    header: `s=${"ab".repeat(32)},t=abcdef`,
    expect: "format_error",
  }),
  vector("malformed-non-hex-signature", {
    nonce: "n/a",
    body: realCompact,
    header: `t=abcdef,s=${"zz".repeat(32)}`,
    expect: "format_error",
    note: "Buffer.from(hex) silently truncates invalid hex — must be rejected by format parse, not by compare",
  }),
  vector("malformed-short-signature", {
    nonce: "n/a",
    body: realCompact,
    header: `t=abcdef,s=${"ab".repeat(16)}`,
    expect: "format_error",
    note: "32 hex chars; naive byte compare would throw RangeError in timingSafeEqual",
  }),
  vector("malformed-empty-nonce", {
    nonce: "n/a",
    body: realCompact,
    header: `t=,s=${"ab".repeat(32)}`,
    expect: "format_error",
  }),
);

{
  const nonce = "1234567890abcdef";
  const prettyBytes = Buffer.from(unicodePayload, "utf8");
  const sig = sign(SIGNING_KEY, nonce, prettyBytes);
  const reserialized = JSON.stringify(JSON.parse(unicodePayload));
  vectors.push({
    name: "reserialized-body-pitfall",
    signing_key: SIGNING_KEY,
    payload_base64: Buffer.from(reserialized, "utf8").toString("base64"),
    sig_header: `t=${nonce},s=${sig}`,
    expect: "signature_mismatch",
    note: "signature is over the pretty bytes; verifying the JSON.parse->stringify normalization must FAIL",
  });
}

vectors.push(
  vector("valid-sig-non-json-body", {
    nonce: "feedface00112233",
    body: "this is definitely not json {",
    expect: "payload_error",
    note: "authentic but unparseable — distinct error from signature failure",
  }),
  vector("valid-sig-bad-envelope", {
    nonce: "0011223344556677",
    body: JSON.stringify({ foo: 1 }),
    expect: "envelope_error",
    note: "valid JSON but missing event_id/event_type/event_body",
  }),
);

const out = { version: 1, signing_key: SIGNING_KEY, vectors };
const outPath = existingVectorsPath;
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, JSON.stringify(out, null, 2) + "\n");
console.log(`wrote ${outPath} (${vectors.length} vectors)`);
