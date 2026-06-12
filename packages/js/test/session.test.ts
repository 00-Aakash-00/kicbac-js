import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { KicbacError, KicbacTokenizationError } from "../src/index.js";
import { createFieldSession } from "../src/session.js";
import { installMockCollectJS, type MockCollectJS } from "../src/testing.js";
import type { KicbacFieldSession, KicbacFieldsSnapshot } from "../src/types.js";

let mock: MockCollectJS;

function mountContainers(): void {
  document.body.innerHTML = `
    <div data-kb-mount="cc"></div>
    <div data-kb-mount="exp"></div>
    <div data-kb-mount="cvv"></div>
  `;
}

function createSession(
  overrides: Partial<Parameters<typeof createFieldSession>[1]> = {},
): KicbacFieldSession {
  return createFieldSession(mock.collectJS, {
    fields: {
      ccnumber: { selector: '[data-kb-mount="cc"]' },
      ccexp: { selector: '[data-kb-mount="exp"]' },
      cvv: { selector: '[data-kb-mount="cvv"]' },
    },
    ...overrides,
  });
}

beforeEach(() => {
  mock = installMockCollectJS();
  mountContainers();
});

afterEach(() => {
  vi.useRealTimers();
  mock.reset();
  document.body.innerHTML = "";
});

describe("createFieldSession", () => {
  it("calls CollectJS.configure exactly once with inline variant and field selectors", () => {
    createSession();
    expect(mock.configureCalls).toHaveLength(1);
    const config = mock.configureCalls[0]!;
    expect(config.variant).toBe("inline");
    expect(config.styleSniffer).toBe(false);
    expect(config.fields?.ccnumber?.selector).toBe('[data-kb-mount="cc"]');
    expect(config.fields?.ccexp?.selector).toBe('[data-kb-mount="exp"]');
    expect(config.fields?.cvv?.selector).toBe('[data-kb-mount="cvv"]');
    expect(config.customCss).toBeDefined();
    expect(config.invalidCss).toBeDefined();
    expect(config.focusCss).toBeDefined();
  });

  it("throws session_conflict while another session is active, explaining one form per page", () => {
    createSession();
    let error: unknown;
    try {
      createSession();
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(KicbacError);
    expect((error as KicbacError).code).toBe("session_conflict");
    expect((error as KicbacError).message).toMatch(/single payment form per page/);
  });

  it("destroy() is idempotent and synchronously frees the slot for a new session", () => {
    const first = createSession();
    first.destroy();
    first.destroy();
    expect(first.isDestroyed).toBe(true);
    const second = createSession();
    expect(second.isDestroyed).toBe(false);
    expect(mock.configureCalls).toHaveLength(2);
  });

  it("fires onReady when Kicbac.js installs its fields", () => {
    const onReady = vi.fn();
    const session = createSession({ onReady });
    expect(session.isReady).toBe(false);
    mock.fireFieldsAvailable();
    expect(onReady).toHaveBeenCalledTimes(1);
    expect(session.isReady).toBe(true);
  });
});

describe("tokenize", () => {
  it("resolves the Kicbac.js response", async () => {
    const session = createSession();
    const promise = session.tokenize();
    expect(mock.startPaymentRequestCalls).toBe(1);
    mock.resolveToken({ token: "tok_abc" });
    await expect(promise).resolves.toMatchObject({ token: "tok_abc", tokenType: "inline" });
  });

  it("returns the SAME promise for concurrent calls and only starts one payment request", async () => {
    const session = createSession();
    const p1 = session.tokenize();
    const p2 = session.tokenize();
    expect(p2).toBe(p1);
    expect(mock.startPaymentRequestCalls).toBe(1);
    mock.resolveToken();
    await p1;
    // After settling, a new tokenize starts a fresh request (decline → re-tokenize).
    const p3 = session.tokenize();
    expect(p3).not.toBe(p1);
    expect(mock.startPaymentRequestCalls).toBe(2);
    mock.resolveToken();
    await p3;
  });

  it("rejects tokenization_timeout when Kicbac.js fires its native timeoutCallback", async () => {
    const session = createSession();
    const promise = session.tokenize();
    const rejection = expect(promise).rejects.toMatchObject({ code: "tokenization_timeout" });
    mock.fireTimeout();
    await rejection;
  });

  it("rejects tokenization_timeout from the local grace timer when Kicbac.js never calls back", async () => {
    vi.useFakeTimers();
    const session = createSession({ timeoutDuration: 5_000 });
    const promise = session.tokenize();
    const rejection = expect(promise).rejects.toSatisfy(
      (e) => e instanceof KicbacTokenizationError && e.code === "tokenization_timeout",
    );
    await vi.advanceTimersByTimeAsync(5_000 + 2_000);
    await rejection;
  });

  it("destroy() mid-flight rejects cancelled, and a late token response is swallowed", async () => {
    const session = createSession();
    const promise = session.tokenize();
    const rejection = expect(promise).rejects.toMatchObject({ code: "cancelled" });
    session.destroy();
    await rejection;
    // Late Kicbac.js callback after destroy must be dropped silently.
    expect(() => mock.resolveToken()).not.toThrow();
  });

  it("rejects cancelled when called on a destroyed session", async () => {
    const session = createSession();
    session.destroy();
    await expect(session.tokenize()).rejects.toMatchObject({ code: "cancelled" });
  });
});

describe("field state machine", () => {
  it("walks untouched → focused → empty → focused → invalid → valid", () => {
    const snapshots: Array<{ snapshot: KicbacFieldsSnapshot; isValid: boolean }> = [];
    const session = createSession({
      onChange: (snapshot, isValid) => snapshots.push({ snapshot, isValid }),
    });
    expect(session.fields.ccnumber?.status).toBe("untouched");

    mock.fireFieldsAvailable();

    mock.fireFocus("ccnumber");
    expect(session.fields.ccnumber?.status).toBe("focused");
    expect(session.fields.ccnumber?.touched).toBe(true);

    mock.fireBlur("ccnumber", { empty: true });
    expect(session.fields.ccnumber?.status).toBe("empty");
    expect(session.fields.ccnumber?.empty).toBe(true);

    mock.fireFocus("ccnumber");
    expect(session.fields.ccnumber?.status).toBe("focused");

    mock.fireBlur("ccnumber", { empty: false });
    // No validation result yet — not focused, not empty, not validated.
    expect(session.fields.ccnumber?.status).toBe("untouched");

    mock.fireValidation("ccnumber", false, "Card number is invalid");
    expect(session.fields.ccnumber?.status).toBe("invalid");
    expect(session.fields.ccnumber?.message).toBe("Card number is invalid");

    mock.fireValidation("ccnumber", true);
    expect(session.fields.ccnumber?.status).toBe("valid");
    expect(session.fields.ccnumber?.message).toBe("");
    expect(snapshots.length).toBeGreaterThan(0);
  });

  it("normalizes the ccnum alias reported by Kicbac.js to ccnumber", () => {
    const session = createSession();
    mock.fireFieldsAvailable();
    mock.fireValidation("ccnum", false, "Bad card");
    expect(session.fields.ccnumber?.status).toBe("invalid");
    expect(session.fields.ccnumber?.message).toBe("Bad card");
  });

  it("ignores validation for fields that were not mounted", () => {
    const session = createSession();
    mock.fireFieldsAvailable();
    expect(() => mock.fireValidation("checkaba", false, "nope")).not.toThrow();
    expect(session.fields.checkaba).toBeUndefined();
  });

  it("blur with detail.empty resets a previously valid field to empty", () => {
    const session = createSession();
    mock.fireFieldsAvailable();
    mock.fireValidation("ccnumber", true);
    expect(session.fields.ccnumber?.status).toBe("valid");
    mock.fireBlur("ccnumber", { empty: true });
    expect(session.fields.ccnumber?.status).toBe("empty");
    expect(session.fields.ccnumber?.valid).toBeNull();
  });

  it("isValid only once every mounted field validated", () => {
    const session = createSession();
    mock.fireFieldsAvailable();
    expect(session.isValid).toBe(false);
    mock.fireValidation("ccnumber", true);
    mock.fireValidation("ccexp", true);
    expect(session.isValid).toBe(false);
    mock.fireValidation("cvv", true);
    expect(session.isValid).toBe(true);
  });

  it("events after destroy() do not mutate state (StrictMode safety)", () => {
    const session = createSession();
    mock.fireFieldsAvailable();
    session.destroy();
    mock.fireValidation("ccnumber", true);
    expect(session.fields.ccnumber?.status).toBe("untouched");
  });
});
