import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import { installMockCollectJS, resetKicbacForTests, type MockCollectJS } from "@kicbac/js/testing";
import { KicbacPaymentForm, KicbacProvider } from "../src/index.js";
import { TEST_KEY, removeInjectedStyles } from "./helpers.jsx";

let mock: MockCollectJS;

beforeEach(() => {
  resetKicbacForTests();
  delete window.CollectJS;
  removeInjectedStyles();
  mock = installMockCollectJS();
});

afterEach(() => {
  mock.reset();
  vi.restoreAllMocks();
});

describe("React StrictMode", () => {
  it("destroy→recreate produces no session_conflict and exactly one field set", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const { container } = render(
      <StrictMode>
        <KicbacProvider tokenizationKey={TEST_KEY}>
          <KicbacPaymentForm amount="10.00" />
        </KicbacProvider>
      </StrictMode>,
    );

    // StrictMode mounts effects twice: session created, destroyed, recreated.
    await waitFor(() => expect(mock.configureCalls.length).toBeGreaterThanOrEqual(1));
    act(() => mock.fireFieldsAvailable());

    // No session_conflict surfaced anywhere (the error region stays empty,
    // and an empty .kb-error is display:none — by design).
    expect(container.querySelector(".kb-error")?.textContent).toBe("");
    expect(consoleError).not.toHaveBeenCalled();

    // Exactly one set of iframes (configure re-draws; destroy dropped the old set).
    expect(container.querySelectorAll("iframe.CollectJSInlineIframe")).toHaveLength(3);

    // The recreated session is fully functional.
    act(() => {
      mock.fireValidation("ccnumber", true);
      mock.fireValidation("ccexp", true);
      mock.fireValidation("cvv", true);
    });
    expect(container.querySelector('.kb-input[data-state="valid"]')).not.toBeNull();
  });
});
