import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { installMockCollectJS, resetKicbacForTests, type MockCollectJS } from "@kicbac/js/testing";
import { CardExpiryField, CardNumberField, KicbacProvider, usePaymentForm } from "../src/index.js";
import type { UsePaymentFormOptions } from "../src/index.js";
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
  vi.unstubAllGlobals();
});

function HeadlessCheckout(options: UsePaymentFormOptions) {
  const form = usePaymentForm(options);
  return (
    <div>
      <span data-testid="status">{form.status}</span>
      <span data-testid="valid">{String(form.isValid)}</span>
      <span data-testid="cc-state">{form.fields.ccnumber?.status ?? "none"}</span>
      <div {...form.getFieldProps("ccnumber", { placeholder: "Card" })} data-testid="cc-mount" />
      <div {...form.getFieldProps("ccexp")} data-testid="exp-mount" />
      <button type="button" onClick={() => void form.submit()}>
        Pay now
      </button>
      <button type="button" onClick={() => form.reset()}>
        Reset
      </button>
    </div>
  );
}

describe("usePaymentForm (headless)", () => {
  it("drives the whole flow through getFieldProps without any Kicbac markup", async () => {
    const onToken = vi.fn();
    render(
      <KicbacProvider tokenizationKey={TEST_KEY}>
        <HeadlessCheckout onToken={onToken} />
      </KicbacProvider>,
    );

    expect(screen.getByTestId("status").textContent).toBe("idle");
    // The mount ids land on the host elements.
    expect(screen.getByTestId("cc-mount").getAttribute("data-kb-mount")).toBeTruthy();

    await waitFor(() => expect(mock.configureCalls).toHaveLength(1));
    expect(screen.getByTestId("status").textContent).toBe("loading");

    // The session mounts exactly the registered fields, with options.
    const config = mock.configureCalls[0]!;
    expect(Object.keys(config.fields ?? {}).sort()).toEqual(["ccexp", "ccnumber"]);
    expect(config.fields?.ccnumber?.placeholder).toBe("Card");

    act(() => mock.fireFieldsAvailable());
    expect(screen.getByTestId("status").textContent).toBe("ready");

    act(() => {
      mock.fireValidation("ccnumber", true);
      mock.fireValidation("ccexp", true);
    });
    expect(screen.getByTestId("valid").textContent).toBe("true");
    expect(screen.getByTestId("cc-state").textContent).toBe("valid");

    fireEvent.click(screen.getByText("Pay now"));
    expect(mock.startPaymentRequestCalls).toBe(1);
    act(() => mock.resolveToken({ token: "tok_headless" }));
    await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("success"));
    expect(onToken).toHaveBeenCalledWith(expect.objectContaining({ token: "tok_headless" }));
  });

  it("reset() clears inputs and returns to ready", async () => {
    const onToken = vi.fn();
    render(
      <KicbacProvider tokenizationKey={TEST_KEY}>
        <HeadlessCheckout onToken={onToken} />
      </KicbacProvider>,
    );
    await waitFor(() => expect(mock.configureCalls).toHaveLength(1));
    act(() => mock.fireFieldsAvailable());
    act(() => {
      mock.fireValidation("ccnumber", true);
      mock.fireValidation("ccexp", true);
    });
    fireEvent.click(screen.getByText("Pay now"));
    act(() => mock.resolveToken());
    await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("success"));

    fireEvent.click(screen.getByText("Reset"));
    expect(screen.getByTestId("status").textContent).toBe("ready");
    expect(screen.getByTestId("cc-state").textContent).toBe("untouched");
    expect(mock.clearInputsCalls).toBe(1);
  });
});
