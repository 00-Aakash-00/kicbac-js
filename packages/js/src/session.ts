import { appearanceToCollectCss } from "./appearance.js";
import { KicbacError, KicbacTokenizationError } from "./errors.js";
import type {
  CollectJS,
  CollectJSConfigureOptions,
  CollectJSFields,
  CollectJSResponse,
  CreateFieldSessionOptions,
  KicbacFieldName,
  KicbacFieldSession,
  KicbacFieldState,
  KicbacFieldsSnapshot,
} from "./types.js";

const FIELD_NAMES: readonly KicbacFieldName[] = [
  "ccnumber",
  "ccexp",
  "cvv",
  "checkname",
  "checkaccount",
  "checkaba",
];

/** Kicbac.js sometimes reports abbreviated field names — normalize defensively. */
const FIELD_ALIASES: Record<string, KicbacFieldName> = {
  ccnum: "ccnumber",
  cc_number: "ccnumber",
  cc_exp: "ccexp",
  check_name: "checkname",
  check_account: "checkaccount",
  check_aba: "checkaba",
};

function normalizeFieldName(raw: string): KicbacFieldName | null {
  if ((FIELD_NAMES as readonly string[]).includes(raw)) return raw as KicbacFieldName;
  return FIELD_ALIASES[raw] ?? null;
}

const DEFAULT_TIMEOUT_DURATION = 10_000;
const GRACE_TIMER_PADDING = 2_000;

/**
 * Kicbac.js is a page-wide singleton with no teardown API: `configure()`
 * re-draws every iframe and wipes user input. We therefore allow exactly one
 * live session, and route Kicbac.js callbacks through a generation counter
 * so callbacks belonging to destroyed sessions are dropped silently.
 */
let activeSession: FieldSession | null = null;
let generation = 0;

/** @internal Test-only: forget the active session without touching the DOM. */
export function __resetActiveSession(): void {
  activeSession?.destroy();
  activeSession = null;
  generation += 1;
}

function initialFieldState(): KicbacFieldState {
  return { status: "untouched", focused: false, touched: false, valid: null, empty: null, message: "" };
}

function deriveStatus(state: KicbacFieldState): KicbacFieldState["status"] {
  if (state.focused) return "focused";
  if (state.valid === true) return "valid";
  if (state.valid === false) return "invalid";
  if (state.empty === true) return "empty";
  return "untouched";
}

interface InFlightTokenize {
  promise: Promise<CollectJSResponse>;
  resolve: (response: CollectJSResponse) => void;
  reject: (error: unknown) => void;
  graceTimer: ReturnType<typeof setTimeout>;
}

class FieldSession implements KicbacFieldSession {
  readonly fields: KicbacFieldsSnapshot = {};
  isReady = false;
  isDestroyed = false;

  private readonly collect: CollectJS;
  private readonly options: CreateFieldSessionOptions;
  private readonly generation: number;
  private readonly mountedFields: KicbacFieldName[];
  private readonly timeoutDuration: number;
  private inflight: InFlightTokenize | null = null;
  private iframeListeners: Array<() => void> = [];

  constructor(collect: CollectJS, options: CreateFieldSessionOptions) {
    this.collect = collect;
    this.options = options;
    this.mountedFields = FIELD_NAMES.filter((name) => options.fields[name]);
    if (this.mountedFields.length === 0) {
      throw new KicbacError(
        "no_fields",
        "createFieldSession() needs at least one field (e.g. { ccnumber: { selector } }).",
      );
    }
    for (const name of this.mountedFields) {
      this.fields[name] = initialFieldState();
    }
    this.timeoutDuration = options.timeoutDuration ?? DEFAULT_TIMEOUT_DURATION;

    generation += 1;
    this.generation = generation;
    activeSession = this;

    this.collect.configure(this.buildConfig());
  }

  get isValid(): boolean {
    return this.mountedFields.every((name) => this.fields[name]?.valid === true);
  }

  /** True while this session still owns the page's Kicbac.js singleton. */
  private get isCurrent(): boolean {
    return generation === this.generation && !this.isDestroyed;
  }

  private buildConfig(): CollectJSConfigureOptions {
    const css = appearanceToCollectCss(this.options.appearance);
    const fields: CollectJSFields = {};
    for (const name of this.mountedFields) {
      const mount = this.options.fields[name];
      if (!mount) continue;
      fields[name] = {
        selector: mount.selector,
        ...(mount.title !== undefined ? { title: mount.title } : {}),
        ...(mount.placeholder !== undefined ? { placeholder: mount.placeholder } : {}),
        ...(name === "cvv" && mount.display !== undefined ? { display: mount.display } : {}),
      };
    }

    const googleFont = this.options.googleFont ?? css.googleFont;
    return {
      variant: "inline",
      styleSniffer: this.options.styleSniffer ?? false,
      // We trigger tokenization via tokenize() — point Kicbac.js at a
      // selector that never matches so it doesn't bind its own click handler.
      paymentSelector: this.options.paymentSelector ?? ".kb-collectjs-detached",
      timeoutDuration: this.timeoutDuration,
      customCss: css.customCss,
      invalidCss: css.invalidCss,
      validCss: css.validCss,
      placeholderCss: css.placeholderCss,
      focusCss: css.focusCss,
      ...(googleFont ? { googleFont } : {}),
      fields,
      fieldsAvailableCallback: () => {
        if (!this.isCurrent) return;
        this.handleFieldsAvailable();
      },
      validationCallback: (field, valid, message) => {
        if (!this.isCurrent) return;
        this.handleValidation(field, valid, message);
      },
      timeoutCallback: () => {
        if (!this.isCurrent) return;
        this.failTokenize(
          new KicbacTokenizationError(
            "tokenization_timeout",
            `Kicbac.js did not finish tokenizing within ${this.timeoutDuration}ms. ` +
              "Check the card details and try again.",
          ),
        );
      },
      callback: (response) => {
        if (!this.isCurrent) return;
        this.handleToken(response);
      },
    };
  }

  private handleFieldsAvailable(): void {
    this.isReady = true;
    this.attachIframeListeners();
    this.options.onReady?.();
    this.emitChange();
  }

  private attachIframeListeners(): void {
    if (typeof document === "undefined") return;
    for (const name of this.mountedFields) {
      const mount = this.options.fields[name];
      if (!mount) continue;
      const container = document.querySelector(mount.selector);
      const iframe = container?.querySelector("iframe.CollectJSInlineIframe");
      if (!iframe) continue;
      const onFocus = () => {
        if (!this.isCurrent) return;
        this.updateField(name, (state) => {
          state.focused = true;
          state.touched = true;
        });
      };
      const onBlur = (event: Event) => {
        if (!this.isCurrent) return;
        const empty = Boolean((event as CustomEvent<{ empty?: boolean }>).detail?.empty);
        this.updateField(name, (state) => {
          state.focused = false;
          state.touched = true;
          state.empty = empty;
          if (empty) {
            // A cleared field is no longer valid/invalid — it's just empty.
            state.valid = null;
            state.message = "";
          }
        });
      };
      iframe.addEventListener("focus", onFocus);
      iframe.addEventListener("blur", onBlur);
      this.iframeListeners.push(() => {
        iframe.removeEventListener("focus", onFocus);
        iframe.removeEventListener("blur", onBlur);
      });
    }
  }

  private handleValidation(rawField: string, valid: boolean, message: string): void {
    const name = normalizeFieldName(rawField);
    if (!name || !this.fields[name]) return;
    this.updateField(name, (state) => {
      state.touched = true;
      state.valid = valid;
      state.message = valid ? "" : message || "";
      if (valid) state.empty = false;
    });
  }

  private updateField(name: KicbacFieldName, mutate: (state: KicbacFieldState) => void): void {
    const previous = this.fields[name];
    if (!previous) return;
    const next: KicbacFieldState = { ...previous };
    mutate(next);
    next.status = deriveStatus(next);
    this.fields[name] = next;
    this.emitChange();
  }

  private emitChange(): void {
    this.options.onChange?.({ ...this.fields }, this.isValid);
  }

  private handleToken(response: CollectJSResponse): void {
    const inflight = this.inflight;
    if (!inflight) return;
    this.inflight = null;
    clearTimeout(inflight.graceTimer);
    inflight.resolve(response);
  }

  private failTokenize(error: unknown): void {
    const inflight = this.inflight;
    if (!inflight) return;
    this.inflight = null;
    clearTimeout(inflight.graceTimer);
    inflight.reject(error);
  }

  tokenize(): Promise<CollectJSResponse> {
    if (this.isDestroyed) {
      return Promise.reject(
        new KicbacTokenizationError("cancelled", "This payment session has been destroyed."),
      );
    }
    if (this.inflight) return this.inflight.promise;

    let resolve!: (response: CollectJSResponse) => void;
    let reject!: (error: unknown) => void;
    const promise = new Promise<CollectJSResponse>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    // Local safety net in case Kicbac.js never invokes callback OR
    // timeoutCallback (e.g. an iframe was removed from the DOM).
    const graceTimer = setTimeout(() => {
      this.failTokenize(
        new KicbacTokenizationError(
          "tokenization_timeout",
          "Kicbac.js never completed the payment request. The payment fields may " +
            "have been removed from the page, or the gateway is unreachable.",
        ),
      );
    }, this.timeoutDuration + GRACE_TIMER_PADDING);
    this.inflight = { promise, resolve, reject, graceTimer };

    try {
      this.collect.startPaymentRequest();
    } catch (error) {
      this.failTokenize(error);
    }
    return promise;
  }

  clearInputs(): void {
    if (this.isDestroyed) return;
    this.collect.clearInputs();
  }

  destroy(): void {
    if (this.isDestroyed) return;
    this.isDestroyed = true;
    // Bump the generation so late Kicbac.js callbacks are dropped, and free
    // the singleton slot synchronously (StrictMode destroy→recreate).
    generation += 1;
    if (activeSession === this) activeSession = null;
    for (const remove of this.iframeListeners) remove();
    this.iframeListeners = [];
    this.failTokenize(
      new KicbacTokenizationError("cancelled", "Tokenization was cancelled because the payment form unmounted."),
    );
  }
}

/** @internal Used by `loadKicbac` to build the client wrapper. */
export function createFieldSession(
  collect: CollectJS,
  options: CreateFieldSessionOptions,
): KicbacFieldSession {
  if (activeSession) {
    throw new KicbacError(
      "session_conflict",
      "Kicbac.js supports a single payment form per page, and another Kicbac field " +
        "session is already active. Destroy the existing session (unmount the other " +
        "payment form) before creating a new one.",
    );
  }
  return new FieldSession(collect, options);
}
