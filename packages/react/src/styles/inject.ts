import cssText from "./kicbac.css?raw";

export const KICBAC_STYLE_ELEMENT_ID = "kicbac-styles";

export interface InjectKicbacStylesOptions {
  /** CSP nonce applied to the injected `<style>` tag. */
  nonce?: string;
  /** Target document (defaults to the global `document`). */
  doc?: Document;
}

/**
 * Inject the Kicbac stylesheet once per document as
 * `<style id="kicbac-styles">` at the START of `<head>`, so merchant CSS
 * (which comes later) wins specificity ties. Idempotent; SSR no-op.
 *
 * Skipped entirely when `<KicbacProvider injectStyles={false}>` — then import
 * `@kicbac/react/styles.css` yourself.
 */
export function injectKicbacStyles(options?: InjectKicbacStylesOptions): void {
  if (typeof document === "undefined" && !options?.doc) return;
  const doc = options?.doc ?? document;
  if (doc.getElementById(KICBAC_STYLE_ELEMENT_ID)) return;
  const style = doc.createElement("style");
  style.id = KICBAC_STYLE_ELEMENT_ID;
  if (options?.nonce) style.setAttribute("nonce", options.nonce);
  style.textContent = cssText;
  doc.head.insertBefore(style, doc.head.firstChild);
}
