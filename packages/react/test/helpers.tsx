import { act, waitFor } from "@testing-library/react";
import type { MockCollectJS } from "@kicbac/js/testing";

export const TEST_KEY = "test-tokenization-key";

/** Wait until the form's Collect.js session has configured the mock. */
export async function waitForConfigure(mock: MockCollectJS, count = 1): Promise<void> {
  await waitFor(() => {
    if (mock.configureCalls.length < count) throw new Error("configure not called yet");
  });
}

/** Drive the mock to the "fields ready" state. */
export async function fieldsReady(mock: MockCollectJS): Promise<void> {
  await waitForConfigure(mock, 1);
  act(() => {
    mock.fireFieldsAvailable();
  });
}

/** Mark every card field valid so submit passes the validation gate. */
export function makeCardFieldsValid(mock: MockCollectJS): void {
  act(() => {
    mock.fireValidation("ccnumber", true);
    mock.fireValidation("ccexp", true);
    mock.fireValidation("cvv", true);
  });
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export function removeInjectedStyles(): void {
  document.getElementById("kicbac-styles")?.remove();
}
