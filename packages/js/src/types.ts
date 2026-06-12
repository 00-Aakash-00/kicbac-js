/**
 * Types for the Kicbac.js global and the Kicbac wrapper around it.
 *
 * Every `CollectJS.configure` option name below is verified against the
 * Kicbac.js field reference (Configuration Variables, pp. 19–28): the JS keys are
 * the camelCase forms of the documented `data-*` attributes.
 */

/** Inline field names supported by Kicbac.js (PDF pp. 16, 24–27). */
export type KicbacFieldName =
  | "ccnumber"
  | "ccexp"
  | "cvv"
  | "checkname"
  | "checkaccount"
  | "checkaba";

export interface CollectJSFieldOptions {
  /** CSS selector for the container the iframe is injected into. */
  selector?: string;
  /** Accessible title for the inline field. */
  title?: string;
  /** Placeholder text for the inline field. */
  placeholder?: string;
}

export interface CollectJSCvvFieldOptions extends CollectJSFieldOptions {
  /** Whether the CVV field is required, optional ("show") or hidden. */
  display?: "show" | "hide" | "required";
}

export interface CollectJSFields {
  ccnumber?: CollectJSFieldOptions;
  ccexp?: CollectJSFieldOptions;
  cvv?: CollectJSCvvFieldOptions;
  checkname?: CollectJSFieldOptions;
  checkaccount?: CollectJSFieldOptions;
  checkaba?: CollectJSFieldOptions;
}

/** Card details in the tokenization response (masked — never a full PAN). */
export interface CollectJSCard {
  number: string | null;
  bin: string | null;
  exp: string | null;
  hash: string | null;
  type: string | null;
}

export interface CollectJSCheck {
  name: string | null;
  account: string | null;
  hash: string | null;
  aba: string | null;
  transit?: string | null;
  institution?: string | null;
}

export interface CollectJSWalletInfo {
  address1: string | null;
  address2: string | null;
  firstName: string | null;
  lastName: string | null;
  postalCode: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  phone: string | null;
}

export interface CollectJSWallet {
  cardDetails: string | null;
  cardNetwork: string | null;
  email: string | null;
  billingInfo: CollectJSWalletInfo | null;
  shippingInfo: CollectJSWalletInfo | null;
}

/**
 * The response passed to the configured `callback` (PDF pp. 28–29).
 * Tokens are single-use and expire after 24 hours — after a declined
 * transaction you must tokenize again.
 */
export interface CollectJSResponse {
  tokenType: string;
  token: string;
  initiatedBy?: Event | undefined;
  card: CollectJSCard;
  check: CollectJSCheck;
  wallet: CollectJSWallet;
}

/** Options object for `CollectJS.configure` (PDF pp. 19–28). */
export interface CollectJSConfigureOptions {
  variant?: "inline" | "lightbox";
  paymentSelector?: string;
  styleSniffer?: boolean | "true" | "false";
  googleFont?: string;
  customCss?: Record<string, string>;
  invalidCss?: Record<string, string>;
  validCss?: Record<string, string>;
  placeholderCss?: Record<string, string>;
  focusCss?: Record<string, string>;
  /** Milliseconds to wait for tokenization; `0` disables the timeout. */
  timeoutDuration?: number;
  timeoutCallback?: () => void;
  fieldsAvailableCallback?: () => void;
  validationCallback?: (field: string, valid: boolean, message: string) => void;
  callback?: (response: CollectJSResponse) => void;
  price?: string;
  currency?: string;
  country?: string;
  fields?: CollectJSFields;
}

/** The `window.CollectJS` global injected by the gateway script. */
export interface CollectJS {
  configure(options?: CollectJSConfigureOptions): void;
  startPaymentRequest(event?: Event): void;
  clearInputs(): void;
  closePaymentRequest?(): void;
}

declare global {
  interface Window {
    CollectJS?: CollectJS;
  }
}

/** Visual status of a single Kicbac.js field, derived from its events. */
export type KicbacFieldStatus = "untouched" | "empty" | "invalid" | "valid" | "focused";

export interface KicbacFieldState {
  status: KicbacFieldStatus;
  /** Whether the field currently has keyboard focus. */
  focused: boolean;
  /** Whether the user has interacted with the field at least once. */
  touched: boolean;
  /** Last validation result; `null` until Kicbac.js validates the field. */
  valid: boolean | null;
  /** Whether the field is empty (known after the first blur); `null` until then. */
  empty: boolean | null;
  /** Validation message from Kicbac.js (empty string when none). */
  message: string;
}

export type KicbacFieldsSnapshot = Partial<Record<KicbacFieldName, KicbacFieldState>>;

export interface KicbacFieldMountOptions {
  /** CSS selector for the container Kicbac.js injects the iframe into. */
  selector: string;
  title?: string;
  placeholder?: string;
  /** CVV only: required (default), optional ("show") or hidden. */
  display?: "show" | "hide" | "required";
}

export interface CreateFieldSessionOptions {
  /** Fields to mount, keyed by Kicbac.js field name. */
  fields: Partial<Record<KicbacFieldName, KicbacFieldMountOptions>>;
  /** Appearance translated to Kicbac.js customCss/invalidCss/validCss/placeholderCss/focusCss. */
  appearance?: KicbacAppearance;
  /**
   * Kicbac.js `timeoutDuration` in ms (default 10000). The session also arms
   * a local grace timer of `timeoutDuration + 2000` ms in case Kicbac.js
   * never calls back.
   */
  timeoutDuration?: number;
  /** Kicbac.js style sniffer (default false — Kicbac ships designed styles). */
  styleSniffer?: boolean;
  /** Extra Google Font spec, e.g. "Inter:400,500,600" (auto-derived from appearance fontFamily). */
  googleFont?: string;
  /**
   * Kicbac.js payment trigger selector. Defaults to a selector that matches
   * nothing — call `session.tokenize()` to start tokenization instead.
   */
  paymentSelector?: string;
  /** Called once Kicbac.js has installed its iframes. */
  onReady?: () => void;
  /** Called whenever any field's state changes. */
  onChange?: (snapshot: KicbacFieldsSnapshot, isValid: boolean) => void;
}

export interface KicbacFieldSession {
  /** Latest per-field state. */
  readonly fields: KicbacFieldsSnapshot;
  /** True once every mounted field has validated successfully. */
  readonly isValid: boolean;
  /** True once Kicbac.js has installed its iframes. */
  readonly isReady: boolean;
  /** True after `destroy()` was called. */
  readonly isDestroyed: boolean;
  /**
   * Validate + tokenize the mounted fields. Returns the same in-flight
   * promise if called again while tokenizing (double-submit guard).
   */
  tokenize(): Promise<CollectJSResponse>;
  /** Clear everything the user typed into the Kicbac.js fields. */
  clearInputs(): void;
  /**
   * Tear the session down. Idempotent; synchronously frees the page's single
   * Kicbac.js session slot and cancels an in-flight `tokenize()`.
   */
  destroy(): void;
}

export interface KicbacClient {
  /** The raw `window.CollectJS` global, for advanced use. */
  readonly collectJS: CollectJS;
  /** The tokenization key the script was loaded with. */
  readonly tokenizationKey: string;
  /**
   * Mount Kicbac.js fields and get a tokenization session. Kicbac.js is a
   * page-wide singleton, so only one session may exist at a time.
   */
  createFieldSession(options: CreateFieldSessionOptions): KicbacFieldSession;
}

export interface LoadKicbacOptions {
  /** Override the Kicbac.js script URL (defaults to the Kicbac gateway). */
  scriptUrl?: string;
  /** CSP nonce applied to the injected script tag. */
  nonce?: string;
}

/* ------------------------------------------------------------------ */
/* Appearance API                                                      */
/* ------------------------------------------------------------------ */

export interface KicbacAppearanceVariables {
  /** Accent color for focus states and the CTA. Default `#f04ac4`. */
  colorPrimary?: string;
  /** Input/body text color. Default `#141442`. */
  colorText?: string;
  /** Muted/secondary text color. */
  colorTextMuted?: string;
  /** Error color. Default `#e5484d`. */
  colorDanger?: string;
  /** Success color. Default `#30a46c`. */
  colorSuccess?: string;
  /** Input background. Default `#ffffff`. */
  colorBackground?: string;
  /** Card surface behind the form. Default `#ffffff`. */
  colorSurface?: string;
  /** Placeholder text color. Default `#989898`. */
  colorTextPlaceholder?: string;
  /** Font stack. Default `'Inter', -apple-system, 'Segoe UI', sans-serif`. */
  fontFamily?: string;
  /** Input font size. Default `16px`. */
  fontSize?: string;
  /** Input/button corner radius. Default `10px`. */
  borderRadius?: string;
  /** Card surface corner radius. Default `16px`. */
  borderRadiusCard?: string;
  /** Input border color. Default `#e4e4ec`. */
  borderColor?: string;
  /** Base spacing unit. Default `4px`. */
  spacingUnit?: string;
  /** CTA button background. Defaults to the Kicbac gradient; set a solid color to remove it. */
  gradientCta?: string;
}

/** Stable `kb-*` element slots that accept extra class names. */
export type KicbacElementKey =
  | "root"
  | "fieldGroup"
  | "field"
  | "label"
  | "input"
  | "error"
  | "button"
  | "skeleton";

export type KicbacAppearanceElements = Partial<Record<KicbacElementKey, string>>;

/** Raw Kicbac.js CSS overrides; non-allowlisted properties are dropped silently. */
export interface KicbacCollectCssOverrides {
  customCss?: Record<string, string>;
  invalidCss?: Record<string, string>;
  validCss?: Record<string, string>;
  placeholderCss?: Record<string, string>;
  focusCss?: Record<string, string>;
}

/** A reusable preset of appearance variables (see `@kicbac/themes`). */
export interface KicbacTheme {
  variables?: KicbacAppearanceVariables;
  elements?: KicbacAppearanceElements;
  collectCss?: KicbacCollectCssOverrides;
}

export interface KicbacAppearance extends KicbacTheme {
  baseTheme?: KicbacTheme;
}

/** Output of `appearanceToCollectCss` — feeds `CollectJS.configure`. */
export interface KicbacCollectCss {
  customCss: Record<string, string>;
  invalidCss: Record<string, string>;
  validCss: Record<string, string>;
  placeholderCss: Record<string, string>;
  focusCss: Record<string, string>;
  googleFont?: string;
}
