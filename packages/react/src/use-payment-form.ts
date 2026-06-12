import { useCallback, useEffect, useId, useMemo, useReducer, useRef } from "react";
import { KicbacError, KicbacTokenizationError } from "@kicbac/js";
import type {
  CollectJSResponse,
  KicbacAppearance,
  KicbacFieldName,
  KicbacFieldSession,
  KicbacFieldsSnapshot,
} from "@kicbac/js";
import { KicbacDeclineError, KicbacEndpointError, type KicbacFormError } from "./errors.js";
import { mergeAppearance } from "./internal/appearance.js";
import { postToken, type KicbacPaymentSuccess } from "./internal/endpoint.js";
import {
  formReducer,
  initialFormState,
  type KicbacFormStatus,
} from "./internal/machine.js";
import { useKicbacContext } from "./provider.js";

export interface FieldRegistrationOptions {
  placeholder?: string;
  title?: string;
  /** CVV only. */
  display?: "show" | "hide" | "required";
}

export interface KicbacFieldMountProps {
  "data-kb-mount": string;
}

export interface UsePaymentFormOptions {
  /** Amount as a decimal string, e.g. `"49.99"` (sent to the endpoint). */
  amount?: string;
  currency?: string;
  /** Charge endpoint (default `/api/kicbac`); pairs with `createKicbacRouteHandler`. */
  endpoint?: string;
  /** Arbitrary JSON forwarded to the endpoint. */
  metadata?: Record<string, unknown>;
  /** Headless escape hatch: receive the token yourself — no endpoint POST happens. */
  onToken?: (response: CollectJSResponse) => void | Promise<void>;
  onSuccess?: (payment: KicbacPaymentSuccess) => void;
  onError?: (error: KicbacFormError) => void;
  /** Appearance merged over the provider's appearance. */
  appearance?: KicbacAppearance;
}

export interface UsePaymentFormReturn {
  status: KicbacFormStatus;
  fields: KicbacFieldsSnapshot;
  isValid: boolean;
  error: KicbacFormError | null;
  /** Tokenize then charge. Idempotent while in flight (double-submit guard). */
  submit: () => Promise<void>;
  /** Clear inputs and return to `ready`. */
  reset: () => void;
  /**
   * Register a Collect.js field and get the mount-point props for its host
   * element: `<div {...getFieldProps("ccnumber")} />`. Must be rendered
   * before the session is created (i.e. during the initial mount).
   */
  getFieldProps: (
    field: KicbacFieldName,
    options?: FieldRegistrationOptions,
  ) => KicbacFieldMountProps;
}

interface FieldRegistration {
  mountId: string;
  options: FieldRegistrationOptions;
}

function isCancellation(error: unknown): boolean {
  if (error instanceof KicbacTokenizationError && error.code === "cancelled") return true;
  return error instanceof DOMException && error.name === "AbortError";
}

function toFormError(error: unknown): KicbacFormError {
  if (error instanceof KicbacDeclineError) {
    return {
      type: "decline",
      code: error.responseCode,
      message: error.responseText
        ? `${error.responseText} — your card was not charged. Try another card.`
        : "The payment was declined — your card was not charged. Try another card.",
      responseText: error.responseText,
    };
  }
  if (error instanceof KicbacEndpointError) {
    return {
      type: "endpoint",
      code: error.code,
      message: error.message,
      ...(error.status !== undefined ? { status: error.status } : {}),
    };
  }
  if (error instanceof KicbacTokenizationError) {
    return { type: "tokenization", code: error.code, message: error.message };
  }
  if (error instanceof KicbacError) {
    return { type: "tokenization", code: error.code, message: error.message };
  }
  return {
    type: "tokenization",
    code: "unknown_error",
    message: error instanceof Error ? error.message : "Something went wrong. Please try again.",
  };
}

/**
 * Headless payment form: mounts Collect.js fields via `getFieldProps`, tracks
 * the status machine, validates, tokenizes and (unless `onToken` is set)
 * POSTs the token to the charge endpoint.
 */
export function usePaymentForm(options: UsePaymentFormOptions = {}): UsePaymentFormReturn {
  const { isLoaded, kicbac, loadError, appearance: providerAppearance } = useKicbacContext();
  const mountIdBase = useId();
  const [state, dispatch] = useReducer(formReducer, initialFormState);

  const registrationsRef = useRef<Map<KicbacFieldName, FieldRegistration>>(new Map());
  const sessionRef = useRef<KicbacFieldSession | null>(null);
  const inFlightRef = useRef<Promise<void> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const optionsRef = useRef(options);
  optionsRef.current = options;
  const statusRef = useRef(state.status);
  statusRef.current = state.status;

  const appearance = useMemo(
    () => mergeAppearance(providerAppearance, options.appearance),
    [providerAppearance, options.appearance],
  );
  const appearanceRef = useRef(appearance);
  appearanceRef.current = appearance;

  useEffect(() => {
    if (!loadError) return;
    dispatch({
      type: "LOAD_ERROR",
      error: { type: "load", code: loadError.code, message: loadError.message },
    });
  }, [loadError]);

  useEffect(() => {
    if (!isLoaded || !kicbac) return;
    if (registrationsRef.current.size === 0) return;

    const fields: Partial<Record<KicbacFieldName, { selector: string } & FieldRegistrationOptions>> = {};
    for (const [name, registration] of registrationsRef.current) {
      const escaped = registration.mountId.replace(/["\\]/g, "\\$&");
      fields[name] = {
        selector: `[data-kb-mount="${escaped}"]`,
        ...registration.options,
      };
    }

    let session: KicbacFieldSession;
    try {
      session = kicbac.createFieldSession({
        fields,
        appearance: appearanceRef.current,
        onReady: () => dispatch({ type: "READY" }),
        onChange: (snapshot, isValid) =>
          dispatch({ type: "FIELDS_CHANGE", fields: snapshot, isValid }),
      });
    } catch (error) {
      const code = error instanceof KicbacError ? error.code : "session_failed";
      dispatch({
        type: "LOAD_ERROR",
        error: {
          type: "load",
          code,
          message: error instanceof Error ? error.message : String(error),
        },
      });
      return;
    }
    sessionRef.current = session;
    dispatch({ type: "SESSION_CREATED" });

    return () => {
      // Destroy synchronously so StrictMode's destroy→recreate never sees a
      // session_conflict, and abort any in-flight endpoint POST.
      session.destroy();
      if (sessionRef.current === session) sessionRef.current = null;
      abortRef.current?.abort();
      abortRef.current = null;
      inFlightRef.current = null;
    };
  }, [isLoaded, kicbac]);

  const submit = useCallback((): Promise<void> => {
    if (inFlightRef.current) return inFlightRef.current;
    const session = sessionRef.current;
    const status = statusRef.current;
    if (!session || (status !== "ready" && status !== "error")) return Promise.resolve();

    if (!session.isValid) {
      const invalidFields = Array.from(registrationsRef.current.keys()).filter(
        (name) => session.fields[name]?.valid !== true,
      );
      const error: KicbacFormError = {
        type: "validation",
        message: "Please check the highlighted payment details.",
        fields: invalidFields,
      };
      dispatch({ type: "SUBMIT_INVALID", error });
      optionsRef.current.onError?.(error);
      return Promise.resolve();
    }

    dispatch({ type: "SUBMIT" });
    const controller = new AbortController();
    abortRef.current = controller;

    const run = (async () => {
      try {
        const response = await session.tokenize();
        const current = optionsRef.current;
        if (current.onToken) {
          await current.onToken(response);
          if (!controller.signal.aborted) dispatch({ type: "COMPLETE" });
        } else {
          dispatch({ type: "TOKENIZED" });
          const payment = await postToken({
            endpoint: current.endpoint ?? "/api/kicbac",
            token: response.token,
            amount: current.amount,
            currency: current.currency,
            metadata: current.metadata,
            signal: controller.signal,
          });
          if (!controller.signal.aborted) {
            dispatch({ type: "COMPLETE" });
            current.onSuccess?.(payment);
          }
        }
      } catch (error) {
        // Unmount/destroy mid-flight: stay silent — no state updates, no callbacks.
        if (controller.signal.aborted || isCancellation(error)) return;
        const formError = toFormError(error);
        dispatch({ type: "FAIL", error: formError });
        optionsRef.current.onError?.(formError);
      } finally {
        inFlightRef.current = null;
        if (abortRef.current === controller) abortRef.current = null;
      }
    })();
    inFlightRef.current = run;
    return run;
  }, []);

  const reset = useCallback(() => {
    sessionRef.current?.clearInputs();
    dispatch({ type: "RESET" });
  }, []);

  const getFieldProps = useCallback(
    (field: KicbacFieldName, fieldOptions?: FieldRegistrationOptions): KicbacFieldMountProps => {
      let registration = registrationsRef.current.get(field);
      if (!registration) {
        registration = { mountId: `${mountIdBase}${field}`, options: fieldOptions ?? {} };
        registrationsRef.current.set(field, registration);
      } else if (fieldOptions) {
        registration.options = fieldOptions;
      }
      return { "data-kb-mount": registration.mountId };
    },
    [mountIdBase],
  );

  return {
    status: state.status,
    fields: state.fields,
    isValid: state.isValid,
    error: state.error,
    submit,
    reset,
    getFieldProps,
  };
}
