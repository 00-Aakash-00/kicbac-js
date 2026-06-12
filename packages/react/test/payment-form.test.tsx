import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { installMockCollectJS, resetKicbacForTests, type MockCollectJS } from "@kicbac/js/testing";
import { KicbacPaymentForm, KicbacProvider } from "../src/index.js";
import type { KicbacFormError, KicbacPaymentSuccess } from "../src/index.js";
import {
  TEST_KEY,
  fieldsReady,
  jsonResponse,
  makeCardFieldsValid,
  removeInjectedStyles,
} from "./helpers.jsx";

let mock: MockCollectJS;
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  resetKicbacForTests();
  delete window.CollectJS;
  removeInjectedStyles();
  mock = installMockCollectJS();
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  mock.reset();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function renderForm(
  props: Partial<Parameters<typeof KicbacPaymentForm>[0]> = {},
): ReturnType<typeof render> {
  return render(
    <KicbacProvider tokenizationKey={TEST_KEY}>
      <KicbacPaymentForm amount="49.99" {...props} />
    </KicbacProvider>,
  );
}

describe("KicbacPaymentForm full flow", () => {
  it("renders skeletons while loading, then live fields once Collect.js is ready", async () => {
    const { container } = renderForm();
    expect(container.querySelectorAll(".kb-skeleton").length).toBeGreaterThan(0);
    await fieldsReady(mock);
    expect(container.querySelectorAll(".kb-skeleton")).toHaveLength(0);
    expect(container.querySelectorAll("iframe.CollectJSInlineIframe")).toHaveLength(3);
    expect(screen.getByRole("button").textContent).toContain("Pay");
    expect(screen.getByRole("button").textContent).toContain("49.99");
  });

  it("success path: tokenizes, POSTs to /api/kicbac, fires onSuccess with the payload", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        ok: true,
        transactionId: "1234560000",
        authCode: "123456",
        amount: "49.99",
        raw: { response: "1" },
      }),
    );
    const onSuccess = vi.fn<(p: KicbacPaymentSuccess) => void>();
    renderForm({ onSuccess, metadata: { orderId: "o_1" } });
    await fieldsReady(mock);
    makeCardFieldsValid(mock);

    fireEvent.click(screen.getByRole("button"));
    expect(mock.startPaymentRequestCalls).toBe(1);
    act(() => mock.resolveToken({ token: "tok_live_1" }));

    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
    expect(onSuccess).toHaveBeenCalledWith({
      transactionId: "1234560000",
      authCode: "123456",
      amount: "49.99",
      raw: { response: "1" },
    });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/kicbac");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({
      token: "tok_live_1",
      amount: "49.99",
      currency: "USD",
      metadata: { orderId: "o_1" },
    });

    // Success state: check icon + disabled button.
    const button = screen.getByRole<HTMLButtonElement>("button");
    expect(button.disabled).toBe(true);
    expect(button.querySelector(".kb-button__check")).not.toBeNull();
  });

  it("402 decline is recoverable: resubmit re-tokenizes with a fresh token", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ ok: false, code: 200, message: "DECLINE" }, 402))
      .mockResolvedValueOnce(
        jsonResponse({ ok: true, transactionId: "tx_2", authCode: "A2", amount: "49.99", raw: {} }),
      );
    const onError = vi.fn<(e: KicbacFormError) => void>();
    const onSuccess = vi.fn();
    renderForm({ onError, onSuccess });
    await fieldsReady(mock);
    makeCardFieldsValid(mock);

    fireEvent.click(screen.getByRole("button"));
    act(() => mock.resolveToken({ token: "tok_first" }));
    await waitFor(() => expect(onError).toHaveBeenCalledTimes(1));
    expect(onError.mock.calls[0]![0]).toMatchObject({
      type: "decline",
      code: 200,
      responseText: "DECLINE",
    });
    expect(screen.getByRole("alert").textContent).toMatch(/DECLINE/);

    // Tokens are single-use — a resubmit must startPaymentRequest again.
    fireEvent.click(screen.getByRole("button"));
    expect(mock.startPaymentRequestCalls).toBe(2);
    act(() => mock.resolveToken({ token: "tok_second" }));
    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));

    const secondBody = JSON.parse((fetchMock.mock.calls[1] as [string, RequestInit])[1].body as string);
    expect(secondBody.token).toBe("tok_second");
  });

  it("500 from the endpoint surfaces an endpoint error with the status", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: false, code: "server_error" }, 500));
    const onError = vi.fn<(e: KicbacFormError) => void>();
    renderForm({ onError });
    await fieldsReady(mock);
    makeCardFieldsValid(mock);
    fireEvent.click(screen.getByRole("button"));
    act(() => mock.resolveToken());
    await waitFor(() => expect(onError).toHaveBeenCalledTimes(1));
    expect(onError.mock.calls[0]![0]).toMatchObject({
      type: "endpoint",
      code: "endpoint_http",
      status: 500,
    });
  });

  it("fetch rejection surfaces endpoint_network", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    const onError = vi.fn<(e: KicbacFormError) => void>();
    renderForm({ onError });
    await fieldsReady(mock);
    makeCardFieldsValid(mock);
    fireEvent.click(screen.getByRole("button"));
    act(() => mock.resolveToken());
    await waitFor(() => expect(onError).toHaveBeenCalledTimes(1));
    expect(onError.mock.calls[0]![0]).toMatchObject({ type: "endpoint", code: "endpoint_network" });
  });

  it("onToken mode never POSTs to the endpoint", async () => {
    const onToken = vi.fn();
    renderForm({ onToken });
    await fieldsReady(mock);
    makeCardFieldsValid(mock);
    fireEvent.click(screen.getByRole("button"));
    act(() => mock.resolveToken({ token: "tok_headless" }));
    await waitFor(() => expect(onToken).toHaveBeenCalledTimes(1));
    expect(onToken.mock.calls[0]![0]).toMatchObject({ token: "tok_headless" });
    expect(fetchMock).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(screen.getByRole("button").querySelector(".kb-button__check")).not.toBeNull(),
    );
  });

  it("tokenization timeout surfaces a recoverable tokenization error", async () => {
    const onError = vi.fn<(e: KicbacFormError) => void>();
    renderForm({ onError });
    await fieldsReady(mock);
    makeCardFieldsValid(mock);
    fireEvent.click(screen.getByRole("button"));
    act(() => mock.fireTimeout());
    await waitFor(() => expect(onError).toHaveBeenCalledTimes(1));
    expect(onError.mock.calls[0]![0]).toMatchObject({
      type: "tokenization",
      code: "tokenization_timeout",
    });
    // Recoverable: the button is enabled again.
    expect(screen.getByRole<HTMLButtonElement>("button").disabled).toBe(false);
  });
});

describe("validation gate", () => {
  it("invalid submit: no startPaymentRequest, error.fields listed, data-state=invalid, alert text", async () => {
    const onError = vi.fn<(e: KicbacFormError) => void>();
    const { container } = renderForm({ onError });
    await fieldsReady(mock);
    // Only the card number is valid — expiry/cvv untouched.
    act(() => mock.fireValidation("ccnumber", true));

    fireEvent.click(screen.getByRole("button"));
    expect(mock.startPaymentRequestCalls).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();

    await waitFor(() => expect(onError).toHaveBeenCalledTimes(1));
    const error = onError.mock.calls[0]![0];
    expect(error.type).toBe("validation");
    if (error.type === "validation") {
      expect(error.fields).toEqual(["ccexp", "cvv"]);
    }
    expect(screen.getByRole("alert").textContent).toMatch(/check the highlighted/i);
    const states = Array.from(container.querySelectorAll(".kb-input")).map((el) =>
      el.getAttribute("data-state"),
    );
    expect(states).toEqual(["valid", "invalid", "invalid"]);
    const alert = screen.getByRole("alert");
    expect(alert.getAttribute("aria-live")).toBe("polite");
  });
});

describe("double-submit guard", () => {
  it("two rapid clicks → exactly one startPaymentRequest and one fetch; button disabled + aria-busy", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ ok: true, transactionId: "tx", authCode: null, amount: "49.99", raw: {} }),
    );
    renderForm();
    await fieldsReady(mock);
    makeCardFieldsValid(mock);

    const button = screen.getByRole<HTMLButtonElement>("button");
    fireEvent.click(button);
    fireEvent.click(button);
    expect(mock.startPaymentRequestCalls).toBe(1);

    await waitFor(() => {
      expect(button.disabled).toBe(true);
      expect(button.getAttribute("aria-busy")).toBe("true");
    });

    act(() => mock.resolveToken());
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
  });
});

describe("unmount mid-tokenize", () => {
  it("stays silent: no console.error, no fetch, late token swallowed", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const { unmount } = renderForm();
    await fieldsReady(mock);
    makeCardFieldsValid(mock);
    fireEvent.click(screen.getByRole("button"));
    expect(mock.startPaymentRequestCalls).toBe(1);

    unmount();
    // Late Collect.js callback after unmount must be dropped silently.
    mock.resolveToken();
    await act(async () => {
      await Promise.resolve();
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(consoleError).not.toHaveBeenCalled();
  });
});

describe("fatal load failure: consumer-safe status panel", () => {
  it("missing key shows the branded fallback, not empty field boxes or dev text", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubEnv("NEXT_PUBLIC_KICBAC_TOKENIZATION_KEY", "");
    const { container } = render(
      <KicbacProvider>
        <KicbacPaymentForm amount="49.99" />
      </KicbacProvider>,
    );

    const panel = await screen.findByRole("alert");
    expect(panel.classList.contains("kb-status")).toBe(true);
    // No empty input boxes and no pay button — the broken form is gone.
    expect(container.querySelectorAll(".kb-input")).toHaveLength(0);
    expect(container.querySelector(".kb-button")).toBeNull();
    // Consumer copy carries no developer wording.
    const consumerText = panel.querySelector(".kb-status__text")?.textContent ?? "";
    expect(consumerText).toMatch(/unavailable/i);
    expect(consumerText).not.toMatch(/NEXT_PUBLIC|tokenization key|Collect\.js/i);
    expect(panel.querySelector(".kb-status__title")?.textContent).toBeTruthy();
    // A config error can't be fixed by the shopper → no retry button.
    expect(screen.queryByRole("button", { name: /try again/i })).toBeNull();

    vi.unstubAllEnvs();
  });

  it("exposes the real cause to developers (dev note + console.error), hidden in production", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubEnv("NEXT_PUBLIC_KICBAC_TOKENIZATION_KEY", "");

    // Development: dev note present, console.error called with the real code.
    const dev = render(
      <KicbacProvider>
        <KicbacPaymentForm amount="49.99" />
      </KicbacProvider>,
    );
    const devPanel = await screen.findByRole("alert");
    expect(devPanel.querySelector(".kb-status__dev")?.textContent).toMatch(/missing_key/);
    expect(consoleError).toHaveBeenCalledWith(expect.stringMatching(/missing_key/));
    dev.unmount();

    // Production: the dev note is stripped; the shopper sees no internals.
    vi.stubEnv("NODE_ENV", "production");
    const { container } = render(
      <KicbacProvider>
        <KicbacPaymentForm amount="49.99" />
      </KicbacProvider>,
    );
    const prodPanel = await screen.findByRole("alert");
    expect(prodPanel.querySelector(".kb-status__dev")).toBeNull();
    expect(container.textContent).not.toMatch(/missing_key|NEXT_PUBLIC/);

    vi.unstubAllEnvs();
  });

  it("a transient script failure offers a working Try again that recovers to live fields", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    // Start with no Collect.js global so the loader injects a script we can fail.
    delete window.CollectJS;
    resetKicbacForTests();

    const { container } = render(
      <KicbacProvider tokenizationKey={TEST_KEY}>
        <KicbacPaymentForm amount="49.99" />
      </KicbacProvider>,
    );

    const script1 = await waitFor(() => {
      const el = document.querySelector("script[data-tokenization-key]");
      if (!el) throw new Error("script not injected");
      return el;
    });
    await act(async () => {
      script1.dispatchEvent(new Event("error"));
    });

    // Transient failure → panel with a retry affordance, no empty boxes.
    const retry = await screen.findByRole("button", { name: /try again/i });
    expect(container.querySelectorAll(".kb-input")).toHaveLength(0);

    // Retry → loader re-injects; make the second attempt succeed.
    await act(async () => {
      fireEvent.click(retry);
    });
    const script2 = await waitFor(() => {
      const el = document.querySelector("script[data-tokenization-key]");
      if (!el) throw new Error("retry did not re-inject the script");
      return el;
    });
    window.CollectJS = mock.collectJS;
    await act(async () => {
      script2.dispatchEvent(new Event("load"));
    });

    // Session mounts cleanly: live fields appear, the panel is gone.
    await fieldsReady(mock);
    await waitFor(() =>
      expect(container.querySelectorAll("iframe.CollectJSInlineIframe")).toHaveLength(3),
    );
    expect(container.querySelector(".kb-status")).toBeNull();
    expect(screen.getByRole("button").textContent).toContain("Pay");
  });
});
