import { useMemo, type CSSProperties, type FormEvent, type ReactNode } from "react";
import { appearanceToCssVars } from "@kicbac/js";
import type { CollectJSResponse, KicbacAppearance } from "@kicbac/js";
import type { KicbacFormError } from "../errors.js";
import { cx, mergeAppearance } from "../internal/appearance.js";
import type { KicbacPaymentSuccess } from "../internal/endpoint.js";
import { useKicbacContext } from "../provider.js";
import { usePaymentForm } from "../use-payment-form.js";
import {
  CardCvvField,
  CardExpiryField,
  CardNumberField,
  PaymentFormContext,
} from "./fields.jsx";
import { KicbacStatusPanel } from "./status-panel.jsx";

export interface KicbacPaymentFormProps {
  /** Amount as a decimal string, e.g. `"49.99"`. */
  amount: string;
  /** ISO currency code (default `"USD"`). */
  currency?: string;
  /** Charge endpoint (default `"/api/kicbac"`); pairs with `createKicbacRouteHandler`. */
  endpoint?: string;
  onSuccess?: (payment: KicbacPaymentSuccess) => void;
  onError?: (error: KicbacFormError) => void;
  /** Headless escape hatch — receive the token yourself; no endpoint POST happens. */
  onToken?: (response: CollectJSResponse) => void | Promise<void>;
  /** Appearance merged over the provider's appearance. */
  appearance?: KicbacAppearance;
  /** Pay button label (default `Pay $49.99` formatted from amount/currency). */
  buttonLabel?: string;
  /** Render the CVV field (default true). */
  collectCvv?: boolean;
  /** Arbitrary JSON forwarded to the endpoint. */
  metadata?: Record<string, unknown>;
  className?: string;
}

function defaultButtonLabel(amount: string, currency: string): string {
  const numeric = Number(amount);
  if (Number.isFinite(numeric)) {
    try {
      return `Pay ${new Intl.NumberFormat(undefined, { style: "currency", currency }).format(numeric)}`;
    } catch {
      // unknown currency code — fall through
    }
  }
  return `Pay ${amount} ${currency}`;
}

function errorMessage(error: KicbacFormError | null): string {
  return error ? error.message : "";
}

/**
 * The complete, branded Kicbac checkout form: card fields with validation
 * states, a gradient pay button with loading/success states, and inline error
 * display. Tokenizes with Collect.js, then POSTs the token to your endpoint.
 *
 * ```tsx
 * <KicbacPaymentForm amount="49.99" onSuccess={(p) => router.push(`/thanks?id=${p.transactionId}`)} />
 * ```
 */
export function KicbacPaymentForm(props: KicbacPaymentFormProps): ReactNode {
  const {
    amount,
    currency = "USD",
    endpoint,
    onSuccess,
    onError,
    onToken,
    appearance,
    buttonLabel,
    collectCvv = true,
    metadata,
    className,
  } = props;

  const { appearance: providerAppearance, isLoaded, loadError, reload } = useKicbacContext();
  const form = usePaymentForm({
    amount,
    currency,
    ...(endpoint !== undefined ? { endpoint } : {}),
    ...(metadata !== undefined ? { metadata } : {}),
    ...(onToken !== undefined ? { onToken } : {}),
    ...(onSuccess !== undefined ? { onSuccess } : {}),
    ...(onError !== undefined ? { onError } : {}),
    ...(appearance !== undefined ? { appearance } : {}),
  });

  const merged = useMemo(
    () => mergeAppearance(providerAppearance, appearance),
    [providerAppearance, appearance],
  );
  const cssVars = useMemo(() => appearanceToCssVars(merged) as CSSProperties, [merged]);
  const elements = useMemo(() => merged.elements ?? {}, [merged]);
  const contextValue = useMemo(() => ({ form, elements }), [form, elements]);

  const isBusy = form.status === "tokenizing" || form.status === "submitting";
  const isLoading = form.status === "idle" || form.status === "loading";
  const isSuccess = form.status === "success";

  // Fatal: the secure fields can never mount (missing/blocked key, failed
  // script, session conflict). Show the branded fallback instead of empty
  // field boxes + raw developer text. Derived from the provider (`loadError`
  // before a client exists) and the form machine (errors thrown while creating
  // the field session). `isLoaded` flips this off the moment a retry succeeds,
  // so the field divs are committed before the session effect runs.
  const loadFault = (loadError && !isLoaded ? loadError : null) ?? null;
  const fatalError = form.error?.type === "load" ? form.error : null;
  const fatalCode = loadFault?.code ?? fatalError?.code ?? null;
  const fatalMessage = loadFault?.message ?? fatalError?.message;

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void form.submit();
  };

  const label = buttonLabel ?? defaultButtonLabel(amount, currency);

  if (fatalCode !== null) {
    return (
      <div className={cx("kb-root", elements.root, className)} style={cssVars}>
        <KicbacStatusPanel
          code={fatalCode}
          {...(fatalMessage !== undefined ? { devMessage: fatalMessage } : {})}
          onRetry={reload}
          elements={elements}
        />
      </div>
    );
  }

  return (
    <PaymentFormContext.Provider value={contextValue}>
      <form
        className={cx("kb-root", elements.root, className)}
        style={cssVars}
        onSubmit={handleSubmit}
        noValidate
      >
        <div className={cx("kb-field-group", elements.fieldGroup)}>
          <CardNumberField />
          <CardExpiryField />
          {collectCvv ? <CardCvvField /> : null}
        </div>
        <div className={cx("kb-error", elements.error)} role="alert" aria-live="polite">
          {errorMessage(form.error)}
        </div>
        <button
          type="submit"
          className={cx("kb-button", elements.button)}
          disabled={isLoading || isBusy || isSuccess}
          aria-busy={isBusy || undefined}
        >
          {isBusy ? <span className="kb-button__spinner" aria-hidden="true" /> : null}
          {isSuccess ? (
            <svg
              className="kb-button__check"
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden="true"
            >
              <path
                d="M5 12.5l4.5 4.5L19 7.5"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          ) : null}
          <span className="kb-button__label">{isSuccess ? "Payment complete" : label}</span>
        </button>
      </form>
    </PaymentFormContext.Provider>
  );
}
