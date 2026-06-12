import type { Transport } from "../transport";
import { emptyToNull } from "../decode";
import {
  requireString,
  validateAmount,
  validateFrequency,
  validateOptionalAmount,
  validatePayments,
} from "../validate";
import type { RequestOptions } from "../types/common";
import type { ApprovedPlanResult, PlanCreateParams, PlanResult, PlanUpdateParams } from "../types/recurring";
import { toTransactionResult } from "./transactions";

function toPlanResult(raw: Record<string, string>, requestedPlanId: string | undefined): PlanResult {
  const result = toTransactionResult(raw);
  if (!result.ok) return result;
  const approved: ApprovedPlanResult = {
    ...result,
    planId: emptyToNull(raw["plan_id"]) ?? requestedPlanId ?? null,
  };
  return approved;
}

/**
 * Recurring plan management (`transact.php`, `recurring=add_plan|edit_plan`).
 *
 * There is intentionally NO `delete` method: the gateway's Payment API
 * exposes no `delete_plan` action — plans can only be removed from the
 * merchant control panel (Recurring > Plans). Deleting a subscription is
 * different: see `subscriptions.delete`.
 */
export class PlansResource {
  constructor(private readonly transport: Transport) {}

  /** Create a recurring plan (`recurring=add_plan`). */
  async create(params: PlanCreateParams, opts?: RequestOptions): Promise<PlanResult> {
    validateFrequency(params);
    const raw = await this.transport.transact(
      {
        recurring: "add_plan",
        plan_id: requireString(params.planId, "planId"),
        plan_name: requireString(params.name, "name"),
        plan_amount: validateAmount(params.amount, "amount", { positive: false }),
        plan_payments: validatePayments(params.payments, "payments"),
        day_frequency: params.dayFrequency !== undefined ? String(params.dayFrequency) : undefined,
        month_frequency:
          params.monthFrequency !== undefined ? String(params.monthFrequency) : undefined,
        day_of_month: params.dayOfMonth !== undefined ? String(params.dayOfMonth) : undefined,
        ...params.extra,
      },
      opts,
    );
    return toPlanResult(raw, params.planId);
  }

  /**
   * Edit an existing plan (`recurring=edit_plan`). Careful: every customer
   * subscribed to the plan has their billing changed by the edit.
   */
  async update(params: PlanUpdateParams, opts?: RequestOptions): Promise<PlanResult> {
    validateFrequency(params, { required: false });
    const raw = await this.transport.transact(
      {
        recurring: "edit_plan",
        current_plan_id: requireString(params.currentPlanId, "currentPlanId"),
        plan_id: params.planId,
        plan_name: params.name,
        plan_amount: validateOptionalAmount(params.amount, "amount", { positive: false }),
        plan_payments:
          params.payments !== undefined ? validatePayments(params.payments, "payments") : undefined,
        day_frequency: params.dayFrequency !== undefined ? String(params.dayFrequency) : undefined,
        month_frequency:
          params.monthFrequency !== undefined ? String(params.monthFrequency) : undefined,
        day_of_month: params.dayOfMonth !== undefined ? String(params.dayOfMonth) : undefined,
        ...params.extra,
      },
      opts,
    );
    return toPlanResult(raw, params.planId ?? params.currentPlanId);
  }
}
