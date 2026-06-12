// @vitest-environment node
import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { KicbacPaymentForm, KicbacProvider } from "../../src/index.js";

describe("SSR (renderToString, no window)", () => {
  it("renders the provider + payment form without throwing", () => {
    expect(typeof window).toBe("undefined");
    const html = renderToString(
      <KicbacProvider tokenizationKey="server-key">
        <KicbacPaymentForm amount="49.99" />
      </KicbacProvider>,
    );
    expect(html).toContain("kb-root");
  });

  it("server markup shows the loading skeleton and performs no style injection", () => {
    const html = renderToString(
      <KicbacProvider tokenizationKey="server-key">
        <KicbacPaymentForm amount="49.99" />
      </KicbacProvider>,
    );
    expect(html).toContain("kb-skeleton");
    expect(html).toContain("kb-button");
    // Styles are injected in an effect — never during server render.
    expect(html).not.toContain("kicbac-styles");
  });

  it("usePaymentForm-driven markup includes the field mount points", () => {
    const html = renderToString(
      <KicbacProvider tokenizationKey="server-key">
        <KicbacPaymentForm amount="49.99" />
      </KicbacProvider>,
    );
    expect(html).toContain("data-kb-mount");
    expect(html).toContain('data-state="untouched"');
  });
});
