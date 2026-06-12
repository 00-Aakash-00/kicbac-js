import { describe, expect, it } from "vitest";
import { collectElements, elementToValue, parseXml, type XmlRecord } from "../src/xml";
import { ParseError } from "../src/errors";

/** Abridged from the Query API PDF sample response (multi-<action>). */
const PDF_SAMPLE = `<nm_response>
<transaction>
<transaction_id>2612675976</transaction_id>
<partial_payment_id></partial_payment_id>
<transaction_type>cc</transaction_type>
<condition>complete</condition>
<order_id>1234567890</order_id>
<authorization_code>123456</authorization_code>
<first_name>John</first_name>
<last_name>Smith</last_name>
<address_1>123 Main St</address_1>
<cc_number>4xxxxxxxxxxx1111</cc_number>
<cc_exp>1215</cc_exp>
<product>
<sku>RS-100</sku>
<quantity>1.0000</quantity>
<description>Red Shirt</description>
<amount>10.0000</amount>
</product>
<action>
<amount>11.00</amount>
<action_type>sale</action_type>
<date>20150312215205</date>
<success>1</success>
<source>virtual_terminal</source>
<response_text>SUCCESS</response_text>
<response_code>100</response_code>
<processor_response_text>NO MATCH</processor_response_text>
</action>
<action>
<amount>11.00</amount>
<action_type>level3</action_type>
<date>20150312215205</date>
<success>1</success>
<response_code>100</response_code>
</action>
<action>
<amount>11.00</amount>
<action_type>settle</action_type>
<date>20150313171503</date>
<success>1</success>
<source>internal</source>
<response_text>ACCEPTED</response_text>
<batch_id>76158269</batch_id>
<response_code>100</response_code>
</action>
</transaction>
</nm_response>`;

describe("parseXml", () => {
  it("parses the Query API PDF sample with multiple <action> elements", () => {
    const root = parseXml(PDF_SAMPLE);
    expect(root.name).toBe("nm_response");
    const transactions = collectElements(root, "transaction");
    expect(transactions).toHaveLength(1);
    const record = elementToValue(transactions[0]!) as XmlRecord;
    expect(record["transaction_id"]).toBe("2612675976");
    expect(record["partial_payment_id"]).toBe("");
    expect(record["cc_number"]).toBe("4xxxxxxxxxxx1111");
    expect(record["product"]).toMatchObject({ sku: "RS-100", description: "Red Shirt" });
    const actions = record["action"];
    expect(Array.isArray(actions)).toBe(true);
    expect(actions).toHaveLength(3);
    expect((actions as XmlRecord[])[0]).toMatchObject({
      action_type: "sale",
      response_text: "SUCCESS",
    });
    expect((actions as XmlRecord[])[2]).toMatchObject({
      action_type: "settle",
      batch_id: "76158269",
    });
  });

  it("decodes named, decimal, and hex entities", () => {
    const root = parseXml(
      "<r><v>A &amp; B &lt;C&gt; &quot;D&quot; &apos;E&apos; &#65; &#x42;</v></r>",
    );
    const record = elementToValue(root) as XmlRecord;
    expect(record["v"]).toBe(`A & B <C> "D" 'E' A B`);
  });

  it("handles empty and self-closing elements", () => {
    const root = parseXml("<r><empty></empty><selfclosed/><filled>x</filled></r>");
    const record = elementToValue(root) as XmlRecord;
    expect(record["empty"]).toBe("");
    expect(record["selfclosed"]).toBe("");
    expect(record["filled"]).toBe("x");
  });

  it("skips the XML declaration and comments", () => {
    const root = parseXml('<?xml version="1.0"?><!-- hi --><r><a>1</a><!-- mid --></r>');
    expect(root.name).toBe("r");
    expect((elementToValue(root) as XmlRecord)["a"]).toBe("1");
  });

  it("an empty <nm_response></nm_response> parses to an empty record", () => {
    const root = parseXml("<nm_response></nm_response>");
    expect(root.children).toHaveLength(0);
    expect(elementToValue(root)).toBe("");
  });

  it("throws ParseError on mismatched closing tags", () => {
    expect(() => parseXml("<a><b>1</a></b>")).toThrow(ParseError);
  });

  it("throws ParseError on truncated documents", () => {
    expect(() => parseXml("<nm_response><transaction><amount>1.0")).toThrow(ParseError);
    expect(() => parseXml("<nm_response>")).toThrow(ParseError);
  });

  it("throws ParseError on trailing garbage and non-XML bodies", () => {
    expect(() => parseXml("<a>1</a>unexpected")).toThrow(ParseError);
    expect(() => parseXml("totally not xml")).toThrow(ParseError);
  });

  it("ParseError carries a bodySnippet", () => {
    let caught: unknown;
    try {
      parseXml("<a><b>oops</a>");
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(ParseError);
    expect((caught as ParseError).bodySnippet).toContain("<a><b>oops</a>");
  });
});
