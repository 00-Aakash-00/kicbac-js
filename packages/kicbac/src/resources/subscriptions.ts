import type { Transport } from "../transport";
import { compactParams, type ParamBag } from "../encode";
import { emptyToNull } from "../decode";
import { ValidationError } from "../errors";
import {
  requireString,
  validateAmount,
  validateFrequency,
  validateMerchantDefinedFields,
  validateOptionalAmount,
  validatePayments,
  validatePaymentMethod,
} from "../validate";
import type { RequestOptions } from "../types/common";
import type {
  ApprovedSubscriptionResult,
  SubscriptionCommonFields,
  SubscriptionCreateParams,
  SubscriptionResult,
  SubscriptionUpdateParams,
} from "../types/recurring";
import { mapBilling, mapPaymentMethod, toTransactionResult } from "./transactions";

const SUBSCRIPTION_METHODS = [
  "paymentToken",
  "card",
  "check",
  "googlePayData",
  "applePayData",
  "sourceTransactionId",
] as const;

/**
 * The subscription id arrives in `subscription_id` on current gateway
 * accounts and in `transactionid` on older ones — map defensively,
 * preferring `subscription_id`.
 */
function toSubscriptionResult(raw: Record<string, string>): SubscriptionResult {
  const result = toTransactionResult(raw);
  if (!result.ok) return result;
  const approved: ApprovedSubscriptionResult = {
    ...result,
    subscriptionId: emptyToNull(raw["subscription_id"]) ?? emptyToNull(raw["transactionid"]),
  };
  return approved;
}

function mapSubscriptionCommon(params: SubscriptionCommonFields): ParamBag {
  return compactParams({
    ...mapPaymentMethod(params),
    source_transaction_id: params.sourceTransactionId,
    start_date: params.startDate,
    ...mapBilling(params.billing),
    orderid: params.orderId,
    order_description: params.orderDescription,
    ponumber: params.ponumber,
    currency: params.currency,
    processor_id: params.processorId,
    ...(params.customerReceipt !== undefined
      ? { customer_receipt: params.customerReceipt ? "true" : "false" }
      : {}),
    ...(params.acuEnabled !== undefined
      ? { acu_enabled: params.acuEnabled ? "true" : "false" }
      : {}),
    ...validateMerchantDefinedFields(params.merchantDefinedFields),
    ...params.extra,
  });
}

/** Recurring subscriptions (`transact.php`, `recurring=...`). */
export class SubscriptionsResource {
  constructor(private readonly transport: Transport) {}

  /**
   * Create a subscription (`recurring=add_subscription`) — either against an
   * existing plan (`planId`) or with an inline custom plan (`plan`).
   * Exactly one of the two must be provided.
   */
  async create(params: SubscriptionCreateParams, opts?: RequestOptions): Promise<SubscriptionResult> {
    const hasPlanId = params.planId !== undefined;
    const hasCustomPlan = params.plan !== undefined;
    if (hasPlanId === hasCustomPlan) {
      throw new ValidationError(
        "Invalid subscription: provide exactly one of planId (existing plan) or plan (inline custom plan).",
      );
    }
    validatePaymentMethod(params, SUBSCRIPTION_METHODS);

    let planParams: ParamBag;
    if (hasPlanId) {
      planParams = { plan_id: requireString(params.planId, "planId") };
    } else {
      const plan = params.plan;
      validateFrequency(plan);
      planParams = {
        plan_amount: validateAmount(plan.amount, "plan.amount", { positive: false }),
        plan_payments: validatePayments(plan.payments, "plan.payments"),
        day_frequency: plan.dayFrequency !== undefined ? String(plan.dayFrequency) : undefined,
        month_frequency:
          plan.monthFrequency !== undefined ? String(plan.monthFrequency) : undefined,
        day_of_month: plan.dayOfMonth !== undefined ? String(plan.dayOfMonth) : undefined,
      };
    }

    const raw = await this.transport.transact(
      { recurring: "add_subscription", ...planParams, ...mapSubscriptionCommon(params) },
      opts,
    );
    return toSubscriptionResult(raw);
  }

  /** Update a subscription's plan details or billing (`recurring=update_subscription`). */
  async update(params: SubscriptionUpdateParams, opts?: RequestOptions): Promise<SubscriptionResult> {
    validatePaymentMethod(params, SUBSCRIPTION_METHODS, { required: false });
    if (params.plan) {
      validateFrequency(params.plan, { required: false });
    }
    const raw = await this.transport.transact(
      {
        recurring: "update_subscription",
        subscription_id: requireString(params.subscriptionId, "subscriptionId"),
        plan_amount: validateOptionalAmount(params.plan?.amount, "plan.amount", {
          positive: false,
        }),
        plan_payments:
          params.plan?.payments !== undefined
            ? validatePayments(params.plan.payments, "plan.payments")
            : undefined,
        day_frequency:
          params.plan?.dayFrequency !== undefined ? String(params.plan.dayFrequency) : undefined,
        month_frequency:
          params.plan?.monthFrequency !== undefined
            ? String(params.plan.monthFrequency)
            : undefined,
        day_of_month:
          params.plan?.dayOfMonth !== undefined ? String(params.plan.dayOfMonth) : undefined,
        ...mapPaymentMethod(params),
        source_transaction_id: params.sourceTransactionId,
        start_date: params.startDate,
        ...mapBilling(params.billing),
        orderid: params.orderId,
        order_description: params.orderDescription,
        ponumber: params.ponumber,
        processor_id: params.processorId,
        ...(params.customerReceipt !== undefined
          ? { customer_receipt: params.customerReceipt ? "true" : "false" }
          : {}),
        ...(params.acuEnabled !== undefined
          ? { acu_enabled: params.acuEnabled ? "true" : "false" }
          : {}),
        ...(params.paused !== undefined
          ? { paused_subscription: params.paused ? "true" : "false" }
          : {}),
        ...validateMerchantDefinedFields(params.merchantDefinedFields),
        ...params.extra,
      },
      opts,
    );
    return toSubscriptionResult(raw);
  }

  /** Cancel a subscription (`recurring=delete_subscription`). */
  async delete(subscriptionId: string, opts?: RequestOptions): Promise<SubscriptionResult> {
    const raw = await this.transport.transact(
      {
        recurring: "delete_subscription",
        subscription_id: requireString(subscriptionId, "subscriptionId"),
      },
      opts,
    );
    return toSubscriptionResult(raw);
  }
}
