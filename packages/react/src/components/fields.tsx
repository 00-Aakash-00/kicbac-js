import { createContext, useContext, type ReactNode } from "react";
import type { KicbacAppearanceElements, KicbacFieldName } from "@kicbac/js";
import { cx } from "../internal/appearance.js";
import type { UsePaymentFormReturn } from "../use-payment-form.js";

/** @internal Provided by <KicbacPaymentForm> so field primitives can self-wire. */
export interface PaymentFormContextValue {
  form: UsePaymentFormReturn;
  elements: KicbacAppearanceElements;
}

export const PaymentFormContext = createContext<PaymentFormContextValue | null>(null);

export interface KicbacFieldProps {
  /** Custom label; pass `null` to render no label. */
  label?: ReactNode;
  placeholder?: string;
  className?: string;
  /**
   * The object returned by `usePaymentForm()` — required when the field is
   * rendered outside `<KicbacPaymentForm>` (headless composition).
   */
  form?: UsePaymentFormReturn;
}

const FIELD_DEFAULTS: Record<KicbacFieldName, { label: string; placeholder: string }> = {
  ccnumber: { label: "Card number", placeholder: "1234 1234 1234 1234" },
  ccexp: { label: "Expiration", placeholder: "MM / YY" },
  cvv: { label: "CVV", placeholder: "123" },
  checkname: { label: "Name on account", placeholder: "Jane Doe" },
  checkaccount: { label: "Account number", placeholder: "000123456789" },
  checkaba: { label: "Routing number", placeholder: "110000000" },
};

interface FieldShellProps extends KicbacFieldProps {
  field: KicbacFieldName;
  componentName: string;
}

function FieldShell(props: FieldShellProps): ReactNode {
  const { field, componentName, label, placeholder, className, form: formProp } = props;
  const context = useContext(PaymentFormContext);
  const form = formProp ?? context?.form;
  const elements = context?.elements ?? {};
  if (!form) {
    throw new Error(
      `<${componentName}> must be rendered inside <KicbacPaymentForm>, or be given the ` +
        "form prop from usePaymentForm().",
    );
  }

  const defaults = FIELD_DEFAULTS[field];
  const mountProps = form.getFieldProps(field, {
    placeholder: placeholder ?? defaults.placeholder,
    title: typeof label === "string" ? label : defaults.label,
  });
  const fieldState = form.fields[field];
  const status = fieldState?.status ?? "untouched";
  const isLoading = form.status === "idle" || form.status === "loading";

  return (
    <div
      className={cx(
        "kb-field",
        field === "ccnumber" && "kb-field--full",
        elements.field,
        className,
      )}
    >
      {label === null ? null : (
        <label className={cx("kb-label", elements.label)}>{label ?? defaults.label}</label>
      )}
      <div
        className={cx(
          "kb-input",
          isLoading && "kb-skeleton",
          elements.input,
          isLoading && elements.skeleton,
        )}
        data-state={status}
        {...mountProps}
      />
    </div>
  );
}

function createFieldComponent(field: KicbacFieldName, componentName: string) {
  function FieldComponent(props: KicbacFieldProps): ReactNode {
    return <FieldShell field={field} componentName={componentName} {...props} />;
  }
  FieldComponent.displayName = componentName;
  return FieldComponent;
}

/** Collect.js card number iframe in a styled, stateful wrapper. */
export const CardNumberField = createFieldComponent("ccnumber", "CardNumberField");
/** Collect.js card expiration iframe. */
export const CardExpiryField = createFieldComponent("ccexp", "CardExpiryField");
/** Collect.js CVV iframe. */
export const CardCvvField = createFieldComponent("cvv", "CardCvvField");
/** Collect.js checking account number iframe (ACH). */
export const BankAccountField = createFieldComponent("checkaccount", "BankAccountField");
/** Collect.js routing number iframe (ACH). */
export const BankRoutingField = createFieldComponent("checkaba", "BankRoutingField");
/** Collect.js account holder name iframe (ACH). */
export const BankAccountNameField = createFieldComponent("checkname", "BankAccountNameField");
