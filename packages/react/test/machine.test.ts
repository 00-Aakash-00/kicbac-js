import { describe, expect, it } from "vitest";
import {
  formReducer,
  initialFormState,
  type FormMachineAction,
  type FormMachineState,
  type KicbacFormStatus,
} from "../src/internal/machine.js";
import type { KicbacFormError } from "../src/errors.js";

const loadError: KicbacFormError = { type: "load", code: "script_load_failed", message: "boom" };
const validationError = {
  type: "validation",
  message: "Check fields",
  fields: ["ccnumber"],
} satisfies KicbacFormError;
const declineError: KicbacFormError = {
  type: "decline",
  code: 200,
  message: "DECLINE",
  responseText: "DECLINE",
};

function stateWith(status: KicbacFormStatus): FormMachineState {
  return { ...initialFormState, status };
}

const ACTIONS: Record<string, FormMachineAction> = {
  SESSION_CREATED: { type: "SESSION_CREATED" },
  READY: { type: "READY" },
  SUBMIT: { type: "SUBMIT" },
  SUBMIT_INVALID: { type: "SUBMIT_INVALID", error: validationError },
  TOKENIZED: { type: "TOKENIZED" },
  COMPLETE: { type: "COMPLETE" },
  FAIL: { type: "FAIL", error: declineError },
  RESET: { type: "RESET" },
  LOAD_ERROR: { type: "LOAD_ERROR", error: loadError },
  RECOVER: { type: "RECOVER" },
};

/**
 * Exhaustive status transition table: rows are the current status, columns
 * the action, cells the expected next status.
 */
const TABLE: Record<KicbacFormStatus, Record<keyof typeof ACTIONS, KicbacFormStatus>> = {
  idle: {
    SESSION_CREATED: "loading",
    READY: "ready",
    SUBMIT: "idle",
    SUBMIT_INVALID: "idle",
    TOKENIZED: "idle",
    COMPLETE: "idle",
    FAIL: "idle",
    RESET: "idle",
    LOAD_ERROR: "error",
    RECOVER: "idle",
  },
  loading: {
    SESSION_CREATED: "loading",
    READY: "ready",
    SUBMIT: "loading",
    SUBMIT_INVALID: "loading",
    TOKENIZED: "loading",
    COMPLETE: "loading",
    FAIL: "loading",
    RESET: "loading",
    LOAD_ERROR: "error",
    RECOVER: "loading",
  },
  ready: {
    SESSION_CREATED: "ready",
    READY: "ready",
    SUBMIT: "tokenizing",
    SUBMIT_INVALID: "error",
    TOKENIZED: "ready",
    COMPLETE: "ready",
    FAIL: "ready",
    RESET: "ready",
    LOAD_ERROR: "error",
    RECOVER: "ready",
  },
  tokenizing: {
    SESSION_CREATED: "tokenizing",
    READY: "tokenizing",
    SUBMIT: "tokenizing",
    SUBMIT_INVALID: "tokenizing",
    TOKENIZED: "submitting",
    COMPLETE: "success",
    FAIL: "error",
    RESET: "ready",
    LOAD_ERROR: "error",
    RECOVER: "tokenizing",
  },
  submitting: {
    SESSION_CREATED: "submitting",
    READY: "submitting",
    SUBMIT: "submitting",
    SUBMIT_INVALID: "submitting",
    TOKENIZED: "submitting",
    COMPLETE: "success",
    FAIL: "error",
    RESET: "ready",
    LOAD_ERROR: "error",
    RECOVER: "submitting",
  },
  success: {
    SESSION_CREATED: "success",
    READY: "success",
    SUBMIT: "success",
    SUBMIT_INVALID: "success",
    TOKENIZED: "success",
    COMPLETE: "success",
    FAIL: "success",
    RESET: "ready",
    LOAD_ERROR: "error",
    RECOVER: "success",
  },
  error: {
    SESSION_CREATED: "error",
    READY: "error",
    SUBMIT: "tokenizing",
    SUBMIT_INVALID: "error",
    TOKENIZED: "error",
    COMPLETE: "error",
    FAIL: "error",
    RESET: "ready",
    LOAD_ERROR: "error",
    RECOVER: "error",
  },
};

describe("formReducer transition table", () => {
  for (const [from, row] of Object.entries(TABLE) as Array<
    [KicbacFormStatus, Record<keyof typeof ACTIONS, KicbacFormStatus>]
  >) {
    for (const [actionName, expected] of Object.entries(row)) {
      it(`${from} + ${actionName} → ${expected}`, () => {
        const next = formReducer(stateWith(from), ACTIONS[actionName]!);
        expect(next.status).toBe(expected);
      });
    }
  }
});

describe("formReducer details", () => {
  it("SUBMIT clears the previous error (decline retry)", () => {
    const errored: FormMachineState = { ...stateWith("error"), error: declineError };
    const next = formReducer(errored, { type: "SUBMIT" });
    expect(next.status).toBe("tokenizing");
    expect(next.error).toBeNull();
  });

  it("RECOVER clears a fatal load error and returns to loading", () => {
    const fatal: FormMachineState = { ...stateWith("error"), error: loadError };
    const next = formReducer(fatal, { type: "RECOVER" });
    expect(next.status).toBe("loading");
    expect(next.error).toBeNull();
  });

  it("RECOVER leaves a recoverable (decline) error untouched", () => {
    const declined: FormMachineState = { ...stateWith("error"), error: declineError };
    const next = formReducer(declined, { type: "RECOVER" });
    expect(next.status).toBe("error");
    expect(next.error).toBe(declineError);
  });

  it("SESSION_CREATED recovers from a fatal load error (retry that mounts)", () => {
    const fatal: FormMachineState = { ...stateWith("error"), error: loadError };
    const next = formReducer(fatal, { type: "SESSION_CREATED" });
    expect(next.status).toBe("loading");
    expect(next.error).toBeNull();
  });

  it("FIELDS_CHANGE replaces fields and isValid without touching status", () => {
    const fields = {
      ccnumber: {
        status: "valid" as const,
        focused: false,
        touched: true,
        valid: true,
        empty: false,
        message: "",
      },
    };
    const next = formReducer(stateWith("ready"), { type: "FIELDS_CHANGE", fields, isValid: true });
    expect(next.status).toBe("ready");
    expect(next.fields).toBe(fields);
    expect(next.isValid).toBe(true);
  });

  it("SUBMIT_INVALID forces listed fields to invalid and stores the validation error", () => {
    const ready: FormMachineState = {
      ...stateWith("ready"),
      fields: {
        ccnumber: {
          status: "untouched",
          focused: false,
          touched: false,
          valid: null,
          empty: null,
          message: "",
        },
      },
    };
    const next = formReducer(ready, { type: "SUBMIT_INVALID", error: validationError });
    expect(next.status).toBe("error");
    expect(next.error).toEqual(validationError);
    expect(next.fields.ccnumber?.status).toBe("invalid");
    expect(next.fields.ccnumber?.message).toBeTruthy();
  });

  it("RESET clears the error and returns fields to untouched", () => {
    const errored: FormMachineState = {
      status: "error",
      error: declineError,
      isValid: true,
      fields: {
        ccnumber: {
          status: "valid",
          focused: false,
          touched: true,
          valid: true,
          empty: false,
          message: "",
        },
      },
    };
    const next = formReducer(errored, { type: "RESET" });
    expect(next).toEqual({
      status: "ready",
      error: null,
      isValid: false,
      fields: {
        ccnumber: {
          status: "untouched",
          focused: false,
          touched: false,
          valid: null,
          empty: null,
          message: "",
        },
      },
    });
  });

  it("COMPLETE clears any error", () => {
    const next = formReducer(
      { ...stateWith("submitting"), error: declineError },
      { type: "COMPLETE" },
    );
    expect(next.status).toBe("success");
    expect(next.error).toBeNull();
  });
});
