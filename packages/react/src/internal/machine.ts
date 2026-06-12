import type { KicbacFieldsSnapshot, KicbacFieldState } from "@kicbac/js";
import type { KicbacFormError } from "../errors.js";

export type KicbacFormStatus =
  | "idle"
  | "loading"
  | "ready"
  | "tokenizing"
  | "submitting"
  | "success"
  | "error";

export interface FormMachineState {
  status: KicbacFormStatus;
  error: KicbacFormError | null;
  fields: KicbacFieldsSnapshot;
  isValid: boolean;
}

export type FormMachineAction =
  | { type: "SESSION_CREATED" }
  | { type: "READY" }
  | { type: "FIELDS_CHANGE"; fields: KicbacFieldsSnapshot; isValid: boolean }
  | { type: "SUBMIT" }
  | { type: "SUBMIT_INVALID"; error: Extract<KicbacFormError, { type: "validation" }> }
  | { type: "TOKENIZED" }
  | { type: "COMPLETE" }
  | { type: "FAIL"; error: KicbacFormError }
  | { type: "RESET" }
  | { type: "LOAD_ERROR"; error: Extract<KicbacFormError, { type: "load" }> };

export const initialFormState: FormMachineState = {
  status: "idle",
  error: null,
  fields: {},
  isValid: false,
};

function untouched(state: KicbacFieldState): KicbacFieldState {
  return { ...state, status: "untouched", focused: false, touched: false, valid: null, empty: null, message: "" };
}

/**
 * Pure form status machine:
 * idle → loading → ready → tokenizing → submitting → success
 * with `error` reachable from ready/tokenizing/submitting and recoverable
 * (SUBMIT from `error` re-tokenizes — gateway tokens are single-use).
 */
export function formReducer(state: FormMachineState, action: FormMachineAction): FormMachineState {
  switch (action.type) {
    case "SESSION_CREATED":
      return state.status === "idle" ? { ...state, status: "loading" } : state;

    case "READY":
      return state.status === "idle" || state.status === "loading"
        ? { ...state, status: "ready" }
        : state;

    case "FIELDS_CHANGE":
      return { ...state, fields: action.fields, isValid: action.isValid };

    case "SUBMIT":
      return state.status === "ready" || state.status === "error"
        ? { ...state, status: "tokenizing", error: null }
        : state;

    case "SUBMIT_INVALID": {
      if (state.status !== "ready" && state.status !== "error") return state;
      const fields: KicbacFieldsSnapshot = { ...state.fields };
      for (const name of action.error.fields) {
        const field = fields[name];
        if (field) {
          fields[name] = {
            ...field,
            status: "invalid",
            valid: false,
            touched: true,
            message: field.message || "This field is incomplete.",
          };
        }
      }
      return { ...state, status: "error", error: action.error, fields };
    }

    case "TOKENIZED":
      return state.status === "tokenizing" ? { ...state, status: "submitting" } : state;

    case "COMPLETE":
      return state.status === "tokenizing" || state.status === "submitting"
        ? { ...state, status: "success", error: null }
        : state;

    case "FAIL":
      return state.status === "tokenizing" || state.status === "submitting"
        ? { ...state, status: "error", error: action.error }
        : state;

    case "RESET": {
      if (state.status === "idle" || state.status === "loading") return state;
      const fields: KicbacFieldsSnapshot = {};
      for (const [name, field] of Object.entries(state.fields)) {
        fields[name as keyof KicbacFieldsSnapshot] = untouched(field);
      }
      return { status: "ready", error: null, fields, isValid: false };
    }

    case "LOAD_ERROR":
      return { ...state, status: "error", error: action.error };
  }
}
