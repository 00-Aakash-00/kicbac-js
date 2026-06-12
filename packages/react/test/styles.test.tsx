import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { installMockCollectJS, resetKicbacForTests, type MockCollectJS } from "@kicbac/js/testing";
import { KicbacPaymentForm, KicbacProvider } from "../src/index.js";
import { TEST_KEY, fieldsReady, removeInjectedStyles } from "./helpers.jsx";

let mock: MockCollectJS;

beforeEach(() => {
  resetKicbacForTests();
  delete window.CollectJS;
  removeInjectedStyles();
  mock = installMockCollectJS();
});

afterEach(() => {
  mock.reset();
  removeInjectedStyles();
  vi.restoreAllMocks();
});

function getStyleTags(): HTMLStyleElement[] {
  return Array.from(document.querySelectorAll("style#kicbac-styles"));
}

describe("style injection", () => {
  it("injects #kicbac-styles once at the START of <head>, across two mounts", async () => {
    const probe = document.createElement("style");
    probe.id = "merchant-style";
    document.head.appendChild(probe);

    const first = render(
      <KicbacProvider tokenizationKey={TEST_KEY}>
        <div />
      </KicbacProvider>,
    );
    await waitFor(() => expect(getStyleTags()).toHaveLength(1));
    first.unmount();

    render(
      <KicbacProvider tokenizationKey={TEST_KEY}>
        <div />
      </KicbacProvider>,
    );
    await waitFor(() => expect(getStyleTags()).toHaveLength(1));

    // Inserted before merchant styles so merchant CSS wins ties.
    const styleTag = getStyleTags()[0]!;
    expect(document.head.firstElementChild).toBe(styleTag);
    expect(styleTag.textContent).toContain(".kb-root");
    expect(styleTag.textContent).toContain("prefers-reduced-motion");
    probe.remove();
  });

  it("applies the CSP nonce to the style tag", async () => {
    render(
      <KicbacProvider tokenizationKey={TEST_KEY} nonce="csp-nonce-1">
        <div />
      </KicbacProvider>,
    );
    await waitFor(() => expect(getStyleTags()).toHaveLength(1));
    expect(getStyleTags()[0]!.getAttribute("nonce")).toBe("csp-nonce-1");
  });

  it("injectStyles={false} skips injection", async () => {
    render(
      <KicbacProvider tokenizationKey={TEST_KEY} injectStyles={false}>
        <KicbacPaymentForm amount="10.00" />
      </KicbacProvider>,
    );
    await fieldsReady(mock);
    expect(getStyleTags()).toHaveLength(0);
  });
});

describe("appearance plumbing", () => {
  it("elements.button className lands on the pay button", async () => {
    render(
      <KicbacProvider tokenizationKey={TEST_KEY}>
        <KicbacPaymentForm amount="10.00" appearance={{ elements: { button: "my-pay-button" } }} />
      </KicbacProvider>,
    );
    await fieldsReady(mock);
    const button = screen.getByRole("button");
    expect(button.classList.contains("kb-button")).toBe(true);
    expect(button.classList.contains("my-pay-button")).toBe(true);
  });

  it("provider appearance merges with form appearance (form wins)", async () => {
    const { container } = render(
      <KicbacProvider
        tokenizationKey={TEST_KEY}
        appearance={{ variables: { colorPrimary: "#111111", colorDanger: "#222222" } }}
      >
        <KicbacPaymentForm amount="10.00" appearance={{ variables: { colorPrimary: "#333333" } }} />
      </KicbacProvider>,
    );
    await fieldsReady(mock);
    const root = container.querySelector<HTMLElement>(".kb-root")!;
    expect(root.style.getPropertyValue("--kb-color-primary")).toBe("#333333");
    expect(root.style.getPropertyValue("--kb-color-danger")).toBe("#222222");
  });

  it("css custom properties land on the root for the default theme", async () => {
    const { container } = render(
      <KicbacProvider tokenizationKey={TEST_KEY}>
        <KicbacPaymentForm amount="10.00" />
      </KicbacProvider>,
    );
    await fieldsReady(mock);
    const root = container.querySelector<HTMLElement>(".kb-root")!;
    expect(root.style.getPropertyValue("--kb-color-primary")).toBe("#f04ac4");
    expect(root.style.getPropertyValue("--kb-gradient-cta")).toContain("linear-gradient");
    expect(root.style.getPropertyValue("--kb-radius")).toBe("10px");
  });

  it("appearance variables drive the Kicbac.js configure CSS", async () => {
    render(
      <KicbacProvider tokenizationKey={TEST_KEY}>
        <KicbacPaymentForm amount="10.00" appearance={{ variables: { colorText: "#0000aa" } }} />
      </KicbacProvider>,
    );
    await waitFor(() => expect(mock.configureCalls).toHaveLength(1));
    expect(mock.configureCalls[0]!.customCss?.["color"]).toBe("#0000aa");
    // Literal values only — never var() references.
    for (const value of Object.values(mock.configureCalls[0]!.customCss ?? {})) {
      expect(value).not.toContain("var(");
    }
  });
});
