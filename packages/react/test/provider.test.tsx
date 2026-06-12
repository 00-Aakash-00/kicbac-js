import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { installMockCollectJS, resetKicbacForTests, type MockCollectJS } from "@kicbac/js/testing";
import { KicbacProvider, useKicbac } from "../src/index.js";
import { TEST_KEY, removeInjectedStyles } from "./helpers.jsx";

function Probe() {
  const { isLoaded, kicbac, loadError, reload } = useKicbac();
  return (
    <div>
      <span data-testid="loaded">{String(isLoaded)}</span>
      <span data-testid="client">{kicbac ? kicbac.tokenizationKey : "none"}</span>
      <span data-testid="error">{loadError ? loadError.code : "none"}</span>
      <span data-testid="error-message">{loadError ? loadError.message : ""}</span>
      <button data-testid="reload" onClick={reload}>
        reload
      </button>
    </div>
  );
}

let mock: MockCollectJS | null = null;

beforeEach(() => {
  resetKicbacForTests();
  delete window.CollectJS;
  removeInjectedStyles();
});

afterEach(() => {
  mock?.reset();
  mock = null;
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("KicbacProvider", () => {
  it("tri-state: starts not loaded, becomes loaded once Collect.js is available", async () => {
    mock = installMockCollectJS();
    render(
      <KicbacProvider tokenizationKey={TEST_KEY}>
        <Probe />
      </KicbacProvider>,
    );
    expect(screen.getByTestId("loaded").textContent).toBe("false");
    await waitFor(() => expect(screen.getByTestId("loaded").textContent).toBe("true"));
    expect(screen.getByTestId("client").textContent).toBe(TEST_KEY);
    expect(screen.getByTestId("error").textContent).toBe("none");
  });

  it("script load failure surfaces as loadError (never throws in render)", async () => {
    render(
      <KicbacProvider tokenizationKey={TEST_KEY}>
        <Probe />
      </KicbacProvider>,
    );
    const script = await waitFor(() => {
      const el = document.querySelector("script[data-tokenization-key]");
      if (!el) throw new Error("script not injected yet");
      return el;
    });
    script.dispatchEvent(new Event("error"));
    await waitFor(() =>
      expect(screen.getByTestId("error").textContent).toBe("script_load_failed"),
    );
    expect(screen.getByTestId("loaded").textContent).toBe("false");
  });

  it("missing key surfaces missing_key naming the env var — not thrown", async () => {
    vi.stubEnv("NEXT_PUBLIC_KICBAC_TOKENIZATION_KEY", "");
    render(
      <KicbacProvider>
        <Probe />
      </KicbacProvider>,
    );
    await waitFor(() => expect(screen.getByTestId("error").textContent).toBe("missing_key"));
    expect(screen.getByTestId("error-message").textContent).toContain(
      "NEXT_PUBLIC_KICBAC_TOKENIZATION_KEY",
    );
  });

  it("reload() re-attempts the script after a transient failure", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    render(
      <KicbacProvider tokenizationKey={TEST_KEY}>
        <Probe />
      </KicbacProvider>,
    );

    const script1 = await waitFor(() => {
      const el = document.querySelector("script[data-tokenization-key]");
      if (!el) throw new Error("script not injected yet");
      return el;
    });
    script1.dispatchEvent(new Event("error"));
    await waitFor(() => expect(screen.getByTestId("error").textContent).toBe("script_load_failed"));

    // reload() clears the error and re-injects; a successful second load wins.
    await act(async () => {
      fireEvent.click(screen.getByTestId("reload"));
    });
    await waitFor(() => expect(screen.getByTestId("error").textContent).toBe("none"));
    const script2 = await waitFor(() => {
      const el = document.querySelector("script[data-tokenization-key]");
      if (!el) throw new Error("reload did not re-inject");
      return el;
    });
    mock = installMockCollectJS();
    await act(async () => {
      script2.dispatchEvent(new Event("load"));
    });
    await waitFor(() => expect(screen.getByTestId("loaded").textContent).toBe("true"));
    expect(screen.getByTestId("error").textContent).toBe("none");
  });

  it("useKicbac outside a provider throws a helpful invariant", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<Probe />)).toThrow(/KicbacProvider/);
  });
});
