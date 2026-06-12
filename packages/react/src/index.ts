export { KicbacProvider, useKicbac } from "./provider.js";
export type { KicbacProviderProps, KicbacContextValue } from "./provider.js";

export { usePaymentForm } from "./use-payment-form.js";
export type {
  UsePaymentFormOptions,
  UsePaymentFormReturn,
  FieldRegistrationOptions,
  KicbacFieldMountProps,
} from "./use-payment-form.js";

export { KicbacPaymentForm } from "./components/payment-form.jsx";
export type { KicbacPaymentFormProps } from "./components/payment-form.jsx";

export { KicbacStatusPanel } from "./components/status-panel.jsx";
export type { KicbacStatusPanelProps } from "./components/status-panel.jsx";

export {
  CardNumberField,
  CardExpiryField,
  CardCvvField,
  BankAccountField,
  BankRoutingField,
  BankAccountNameField,
} from "./components/fields.jsx";
export type { KicbacFieldProps } from "./components/fields.jsx";

export { KicbacDeclineError, KicbacEndpointError } from "./errors.js";
export type { KicbacFormError } from "./errors.js";

export { formReducer, initialFormState } from "./internal/machine.js";
export type { FormMachineAction, FormMachineState, KicbacFormStatus } from "./internal/machine.js";

export { postToken } from "./internal/endpoint.js";
export type { KicbacPaymentSuccess, PostTokenInput } from "./internal/endpoint.js";

export { injectKicbacStyles, KICBAC_STYLE_ELEMENT_ID } from "./styles/inject.js";
export type { InjectKicbacStylesOptions } from "./styles/inject.js";

export { mergeAppearance } from "./internal/appearance.js";

// Re-export the core types integrators need without installing @kicbac/js.
export { loadKicbac, appearanceToCollectCss, appearanceToCssVars } from "@kicbac/js";
export type {
  CollectJSResponse,
  KicbacAppearance,
  KicbacAppearanceVariables,
  KicbacClient,
  KicbacFieldName,
  KicbacFieldState,
  KicbacFieldStatus,
  KicbacFieldsSnapshot,
  KicbacTheme,
} from "@kicbac/js";
