/**
 * Test harness: installs a mock `window.CollectJS` that mimics the real
 * gateway script closely enough for offline component tests — configure
 * recording, iframe insertion, validation/focus/blur events, tokenization
 * and timeouts. Never use in production.
 */
import { __resetLoaderState } from "./load.js";
import { __resetActiveSession } from "./session.js";
import type {
  CollectJS,
  CollectJSConfigureOptions,
  CollectJSResponse,
  KicbacFieldName,
} from "./types.js";

export interface MockCollectJS {
  /** Every options object passed to `CollectJS.configure`, in order. */
  readonly configureCalls: CollectJSConfigureOptions[];
  /** Number of `startPaymentRequest` invocations. */
  readonly startPaymentRequestCalls: number;
  /** Number of `clearInputs` invocations. */
  readonly clearInputsCalls: number;
  /** The installed `window.CollectJS` object. */
  readonly collectJS: CollectJS;
  /** Insert `iframe.CollectJSInlineIframe` into each configured selector and fire `fieldsAvailableCallback`. */
  fireFieldsAvailable(): void;
  /** Fire the configured `validationCallback`. */
  fireValidation(field: string, valid: boolean, message?: string): void;
  /** Dispatch a `focus` event on the field's mock iframe. */
  fireFocus(field: KicbacFieldName): void;
  /** Dispatch a `blur` event (with `detail.empty`) on the field's mock iframe. */
  fireBlur(field: KicbacFieldName, detail?: { empty?: boolean }): void;
  /** Invoke the configured `callback` with a token response. */
  resolveToken(partial?: Partial<CollectJSResponse>): void;
  /** Invoke the configured `timeoutCallback`. */
  fireTimeout(): void;
  /** Remove mock iframes, uninstall `window.CollectJS`, clear recorded state and any module-level Kicbac loader/session state. */
  reset(): void;
}

const DEFAULT_RESPONSE: CollectJSResponse = {
  tokenType: "inline",
  token: "3455zJms-7qA2K2-VdVrSu-Rv7WpvPuG7s8",
  card: {
    number: "411111******1111",
    bin: "411111",
    exp: "1028",
    hash: "abcdefghijklmnopqrstuv1234567890",
    type: "visa",
  },
  check: { name: null, account: null, hash: null, aba: null, transit: null, institution: null },
  wallet: {
    cardDetails: null,
    cardNetwork: null,
    email: null,
    billingInfo: null,
    shippingInfo: null,
  },
};

/**
 * Reset every piece of module-level state in `@kicbac/js` (loader cache and
 * the active field session). Call in `beforeEach` to isolate tests.
 */
export function resetKicbacForTests(): void {
  __resetLoaderState();
  __resetActiveSession();
  if (typeof document !== "undefined") {
    for (const el of Array.from(document.querySelectorAll("script[data-tokenization-key]"))) {
      el.remove();
    }
  }
}

export function installMockCollectJS(): MockCollectJS {
  if (typeof window === "undefined") {
    throw new Error("installMockCollectJS() requires a DOM environment (jsdom).");
  }

  let config: CollectJSConfigureOptions | null = null;
  let startCalls = 0;
  let clearCalls = 0;
  const configureCalls: CollectJSConfigureOptions[] = [];
  const iframes = new Map<KicbacFieldName, HTMLIFrameElement>();

  const removeIframes = () => {
    for (const iframe of iframes.values()) iframe.remove();
    iframes.clear();
  };

  const collectJS: CollectJS = {
    configure(options?: CollectJSConfigureOptions) {
      config = options ?? null;
      if (options) configureCalls.push(options);
      // The real script re-draws ALL iframes (wiping input) on configure.
      removeIframes();
    },
    startPaymentRequest() {
      startCalls += 1;
    },
    clearInputs() {
      clearCalls += 1;
    },
  };
  window.CollectJS = collectJS;

  const requireIframe = (field: KicbacFieldName): HTMLIFrameElement => {
    const iframe = iframes.get(field);
    if (!iframe) {
      throw new Error(
        `Mock CollectJS: no iframe for "${field}". Did you call fireFieldsAvailable()?`,
      );
    }
    return iframe;
  };

  const mock: MockCollectJS = {
    get configureCalls() {
      return configureCalls;
    },
    get startPaymentRequestCalls() {
      return startCalls;
    },
    get clearInputsCalls() {
      return clearCalls;
    },
    collectJS,
    fireFieldsAvailable() {
      if (!config?.fields) return;
      removeIframes();
      for (const [field, fieldConfig] of Object.entries(config.fields)) {
        const selector = fieldConfig?.selector;
        if (!selector) continue;
        const container = document.querySelector(selector);
        if (!container) continue;
        const iframe = document.createElement("iframe");
        iframe.className = "CollectJSInlineIframe";
        iframe.setAttribute("data-kb-mock-field", field);
        container.appendChild(iframe);
        iframes.set(field as KicbacFieldName, iframe);
      }
      config.fieldsAvailableCallback?.();
    },
    fireValidation(field, valid, message = "") {
      config?.validationCallback?.(field, valid, message);
    },
    fireFocus(field) {
      requireIframe(field).dispatchEvent(new window.CustomEvent("focus"));
    },
    fireBlur(field, detail) {
      requireIframe(field).dispatchEvent(
        new window.CustomEvent("blur", { detail: { empty: detail?.empty ?? false } }),
      );
    },
    resolveToken(partial) {
      config?.callback?.({
        ...DEFAULT_RESPONSE,
        ...partial,
        card: { ...DEFAULT_RESPONSE.card, ...partial?.card },
        check: { ...DEFAULT_RESPONSE.check, ...partial?.check },
        wallet: { ...DEFAULT_RESPONSE.wallet, ...partial?.wallet },
      });
    },
    fireTimeout() {
      config?.timeoutCallback?.();
    },
    reset() {
      removeIframes();
      configureCalls.length = 0;
      config = null;
      startCalls = 0;
      clearCalls = 0;
      if (window.CollectJS === collectJS) delete window.CollectJS;
      resetKicbacForTests();
    },
  };

  return mock;
}
