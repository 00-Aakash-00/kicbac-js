import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_COLLECT_SCRIPT_URL, KicbacLoadError, loadKicbac } from "../src/index.js";
import { resetKicbacForTests } from "../src/testing.js";

const KEY = "test-tokenization-key";

function getScripts(): HTMLScriptElement[] {
  return Array.from(document.querySelectorAll<HTMLScriptElement>("script[data-tokenization-key]"));
}

function stubCollectJS(): void {
  window.CollectJS = {
    configure: () => {},
    startPaymentRequest: () => {},
    clearInputs: () => {},
  };
}

beforeEach(() => {
  resetKicbacForTests();
  delete window.CollectJS;
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("loadKicbac", () => {
  it("injects a single script tag with the key, data-variant=inline and the gateway URL", async () => {
    const promise = loadKicbac(KEY);
    const scripts = getScripts();
    expect(scripts).toHaveLength(1);
    const script = scripts[0]!;
    expect(script.src).toBe(DEFAULT_COLLECT_SCRIPT_URL);
    expect(script.getAttribute("data-tokenization-key")).toBe(KEY);
    expect(script.getAttribute("data-variant")).toBe("inline");
    expect(script.async).toBe(true);

    stubCollectJS();
    script.dispatchEvent(new Event("load"));
    const client = await promise;
    expect(client?.tokenizationKey).toBe(KEY);
    expect(client?.collectJS).toBe(window.CollectJS);
  });

  it("applies a CSP nonce and custom script URL when provided", async () => {
    const promise = loadKicbac(KEY, { scriptUrl: "https://gw.example.com/token/Collect.js", nonce: "abc123" });
    const script = getScripts()[0]!;
    expect(script.src).toBe("https://gw.example.com/token/Collect.js");
    expect(script.nonce).toBe("abc123");
    stubCollectJS();
    script.dispatchEvent(new Event("load"));
    await promise;
  });

  it("dedupes: same key returns the exact same promise and injects one tag", async () => {
    const first = loadKicbac(KEY);
    const second = loadKicbac(KEY);
    expect(second).toBe(first);
    expect(getScripts()).toHaveLength(1);
    stubCollectJS();
    getScripts()[0]!.dispatchEvent(new Event("load"));
    await first;
    // After resolution a third call still shares the cached promise.
    expect(loadKicbac(KEY)).toBe(first);
  });

  it("rejects key_mismatch when a later call passes a different scriptUrl", async () => {
    const first = loadKicbac(KEY, { scriptUrl: "https://a.example.com/Collect.js" });
    await expect(
      loadKicbac(KEY, { scriptUrl: "https://b.example.com/Collect.js" }),
    ).rejects.toMatchObject({ code: "key_mismatch" });
    // Same key + same scriptUrl still dedupes to the cached promise.
    expect(loadKicbac(KEY, { scriptUrl: "https://a.example.com/Collect.js" })).toBe(first);
    stubCollectJS();
    getScripts()[0]!.dispatchEvent(new Event("load"));
    await first;
  });

  it("rejects key_mismatch for a different key while a load is cached", async () => {
    const first = loadKicbac(KEY);
    await expect(loadKicbac("another-key")).rejects.toMatchObject({ code: "key_mismatch" });
    stubCollectJS();
    getScripts()[0]!.dispatchEvent(new Event("load"));
    await first;
  });

  it("adopts a pre-existing script tag with a matching key instead of injecting", async () => {
    const manual = document.createElement("script");
    manual.src = DEFAULT_COLLECT_SCRIPT_URL;
    manual.setAttribute("data-tokenization-key", KEY);
    document.head.appendChild(manual);

    const promise = loadKicbac(KEY);
    expect(getScripts()).toHaveLength(1);
    stubCollectJS();
    const client = await promise;
    expect(client?.tokenizationKey).toBe(KEY);
  });

  it("rejects key_mismatch when a pre-existing tag has a different key", async () => {
    const manual = document.createElement("script");
    manual.setAttribute("data-tokenization-key", "merchant-key");
    document.head.appendChild(manual);
    await expect(loadKicbac(KEY)).rejects.toMatchObject({ code: "key_mismatch" });
  });

  it("script error rejects script_load_failed naming CSP and ad blockers, clears state, and a retry re-injects", async () => {
    const promise = loadKicbac(KEY);
    const script = getScripts()[0]!;
    script.dispatchEvent(new Event("error"));

    const error = await promise.then(
      () => null,
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(KicbacLoadError);
    expect((error as KicbacLoadError).code).toBe("script_load_failed");
    expect((error as KicbacLoadError).message).toMatch(/Content-Security-Policy/);
    expect((error as KicbacLoadError).message).toMatch(/ad blocker/i);
    // The failed tag was removed and the cache cleared.
    expect(getScripts()).toHaveLength(0);

    const retry = loadKicbac(KEY);
    expect(retry).not.toBe(promise);
    expect(getScripts()).toHaveLength(1);
    stubCollectJS();
    getScripts()[0]!.dispatchEvent(new Event("load"));
    await retry;
  });

  it("rejects script_timeout after 20s when the script never loads", async () => {
    vi.useFakeTimers();
    const promise = loadKicbac(KEY);
    const rejection = expect(promise).rejects.toMatchObject({ code: "script_timeout" });
    await vi.advanceTimersByTimeAsync(20_000);
    await rejection;
  });

  it("rejects collectjs_missing when the script loads but never defines window.CollectJS", async () => {
    vi.useFakeTimers();
    const promise = loadKicbac(KEY);
    const rejection = expect(promise).rejects.toMatchObject({ code: "collectjs_missing" });
    getScripts()[0]!.dispatchEvent(new Event("load"));
    await vi.advanceTimersByTimeAsync(2_100);
    await rejection;
  });

  it("resolves immediately when window.CollectJS already exists (mock harness path)", async () => {
    stubCollectJS();
    const client = await loadKicbac(KEY);
    expect(client?.collectJS).toBe(window.CollectJS);
    expect(getScripts()).toHaveLength(0);
  });

  it("rejects missing_key naming both env vars when no key can be resolved", async () => {
    vi.stubEnv("NEXT_PUBLIC_KICBAC_TOKENIZATION_KEY", "");
    const error = await loadKicbac().then(
      () => null,
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(KicbacLoadError);
    expect((error as KicbacLoadError).code).toBe("missing_key");
    expect((error as KicbacLoadError).message).toContain("NEXT_PUBLIC_KICBAC_TOKENIZATION_KEY");
    expect((error as KicbacLoadError).message).toContain("VITE_KICBAC_TOKENIZATION_KEY");
  });
});
