import { ParseError } from "./errors";

/**
 * Hand-rolled XML parser for query.php responses (`<nm_response>`).
 * Zero-dependency by design. Supports the gateway's flat, attribute-free
 * grammar: named/numeric entities, empty and self-closing elements; skips the
 * declaration, comments, and CDATA sections; throws ParseError on mismatched
 * or truncated tags and trailing garbage.
 */

export interface XmlElement {
  name: string;
  children: XmlElement[];
  text: string;
}

/** A converted element: leaves are strings, repeated tags become arrays. */
export type XmlValue = string | XmlRecord | XmlValue[];
export interface XmlRecord {
  [tag: string]: XmlValue;
}

const NAME_RE = /^[A-Za-z_][A-Za-z0-9_.:-]*/;
const ENTITY_RE = /&(amp|lt|gt|quot|apos|#x[0-9a-fA-F]+|#[0-9]+);/g;
const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
};

function decodeEntities(text: string): string {
  if (!text.includes("&")) return text;
  return text.replace(ENTITY_RE, (whole, entity: string) => {
    const named = NAMED_ENTITIES[entity];
    if (named !== undefined) return named;
    const codePoint =
      entity.startsWith("#x") || entity.startsWith("#X")
        ? Number.parseInt(entity.slice(2), 16)
        : Number.parseInt(entity.slice(1), 10);
    try {
      return String.fromCodePoint(codePoint);
    } catch {
      return whole; // out-of-range reference: leave verbatim
    }
  });
}

/** Parse an XML document and return its root element. */
export function parseXml(input: string): XmlElement {
  let i = 0;
  const n = input.length;

  function fail(reason: string): never {
    throw new ParseError(`Could not parse query.php response as XML: ${reason}.`, {
      bodySnippet: input.slice(0, 200),
      contentType: null,
    });
  }

  /** Skip whitespace, the XML declaration, comments, and CDATA sections. */
  function skipMisc(): void {
    for (;;) {
      while (i < n && /\s/.test(input[i] as string)) i++;
      if (input.startsWith("<?", i)) {
        const end = input.indexOf("?>", i);
        if (end === -1) fail("unterminated XML declaration");
        i = end + 2;
        continue;
      }
      if (input.startsWith("<!--", i)) {
        const end = input.indexOf("-->", i);
        if (end === -1) fail("unterminated comment");
        i = end + 3;
        continue;
      }
      if (input.startsWith("<![CDATA[", i)) {
        const end = input.indexOf("]]>", i);
        if (end === -1) fail("unterminated CDATA section");
        i = end + 3;
        continue;
      }
      return;
    }
  }

  function parseElement(): XmlElement {
    // caller guarantees input[i] === "<"
    i++;
    const nameMatch = NAME_RE.exec(input.slice(i));
    if (!nameMatch) fail("invalid tag name");
    const name = nameMatch[0];
    i += name.length;
    // The gateway grammar is attribute-free; tolerate and ignore anything
    // before the closing bracket rather than failing on it.
    while (i < n && input[i] !== ">") {
      if (input.startsWith("/>", i)) {
        i += 2;
        return { name, children: [], text: "" };
      }
      i++;
    }
    if (i >= n) fail(`unterminated start tag <${name}`);
    i++; // past ">"

    const element: XmlElement = { name, children: [], text: "" };
    for (;;) {
      if (i >= n) fail(`unclosed element <${name}>`);
      if (input[i] === "<") {
        if (input.startsWith("</", i)) {
          const end = input.indexOf(">", i);
          if (end === -1) fail("unterminated end tag");
          const closeName = input.slice(i + 2, end).trim();
          if (closeName !== name) fail(`mismatched closing tag </${closeName}> for <${name}>`);
          i = end + 1;
          return element;
        }
        if (input.startsWith("<!--", i)) {
          const end = input.indexOf("-->", i);
          if (end === -1) fail("unterminated comment");
          i = end + 3;
          continue;
        }
        if (input.startsWith("<![CDATA[", i)) {
          const end = input.indexOf("]]>", i);
          if (end === -1) fail("unterminated CDATA section");
          i = end + 3;
          continue;
        }
        if (input.startsWith("<?", i)) {
          const end = input.indexOf("?>", i);
          if (end === -1) fail("unterminated processing instruction");
          i = end + 2;
          continue;
        }
        element.children.push(parseElement());
      } else {
        const next = input.indexOf("<", i);
        const end = next === -1 ? n : next;
        element.text += decodeEntities(input.slice(i, end));
        i = end;
      }
    }
  }

  skipMisc();
  if (i >= n || input[i] !== "<") fail("expected a root element");
  const root = parseElement();
  skipMisc();
  if (i < n) fail("unexpected trailing content after the root element");
  return root;
}

/**
 * Convert an element to a plain value: leaf elements become (trimmed) strings,
 * elements with children become records, repeated sibling tags become arrays.
 */
export function elementToValue(element: XmlElement): XmlValue {
  if (element.children.length === 0) return element.text.trim();
  const record: XmlRecord = {};
  for (const child of element.children) {
    const value = elementToValue(child);
    const existing = record[child.name];
    if (existing === undefined) {
      record[child.name] = value;
    } else if (Array.isArray(existing)) {
      existing.push(value);
    } else {
      record[child.name] = [existing, value];
    }
  }
  return record;
}

/**
 * Collect elements with the given tag name anywhere in the tree, without
 * descending into matches (the gateway sometimes nests, e.g. a subscription's
 * `<plan>` inside `<subscription>`).
 */
export function collectElements(root: XmlElement, tag: string): XmlElement[] {
  const found: XmlElement[] = [];
  function walk(element: XmlElement): void {
    if (element.name === tag) {
      found.push(element);
      return;
    }
    for (const child of element.children) walk(child);
  }
  for (const child of root.children) walk(child);
  if (root.name === tag) found.push(root);
  return found;
}
