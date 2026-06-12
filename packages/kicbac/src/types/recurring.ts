import type {
  ApprovedTransaction,
  BillingAddress,
  DeclinedTransaction,
  Money,
} from "./common";
import type { VaultPaymentFields } from "./customers";

/** Parameters for `plans.create` (`recurring=add_plan`). */
export interface PlanCreateParams {
  /** Unique plan id referencing this plan. */
  planId: string;
  /** Display name of the plan. */
  name: string;
  /** Amount charged each billing cycle. */
  amount: Money;
  /** Number of payments before the plan completes; 0 = until canceled. */
  payments: number;
  /** Charge every N days. Mutually exclusive with month/dayOfMonth. */
  dayFrequency?: number;
  /** Charge every N months (1-24). Requires `dayOfMonth`. */
  monthFrequency?: number;
  /** Day of the month to charge (1-31). Requires `monthFrequency`. */
  dayOfMonth?: number;
  extra?: Record<string, string>;
}

/**
 * Parameters for `plans.update` (`recurring=edit_plan`). Careful: every
 * subscriber of the plan has their billing changed by the edit.
 */
export interface PlanUpdateParams {
  /** The plan to edit. */
  currentPlanId: string;
  /** New unique plan id. */
  planId?: string;
  name?: string;
  amount?: Money;
  payments?: number;
  dayFrequency?: number;
  monthFrequency?: number;
  dayOfMonth?: number;
  extra?: Record<string, string>;
}

/** Inline plan definition for custom (plan-less) subscriptions. */
export interface CustomPlanFields {
  amount: Money;
  /** Number of payments before the subscription completes; 0 = until canceled. */
  payments: number;
  dayFrequency?: number;
  monthFrequency?: number;
  dayOfMonth?: number;
}

/** Fields shared by both subscription creation shapes. */
export interface SubscriptionCommonFields extends VaultPaymentFields {
  /** First charge date, YYYYMMDD. Defaults to today. */
  startDate?: string;
  billing?: BillingAddress;
  orderId?: string;
  orderDescription?: string;
  ponumber?: string;
  currency?: string;
  processorId?: string;
  customerReceipt?: boolean;
  /** Automatic Card Updater opt-in/out (default true). */
  acuEnabled?: boolean;
  merchantDefinedFields?: Record<number, string>;
  extra?: Record<string, string>;
}

/**
 * Parameters for `subscriptions.create` (`recurring=add_subscription`):
 * either subscribe to an existing plan (`planId`) or define a one-off
 * custom plan inline (`plan`) — exactly one of the two.
 */
export type SubscriptionCreateParams =
  | (SubscriptionCommonFields & { planId: string; plan?: never })
  | (SubscriptionCommonFields & { plan: CustomPlanFields; planId?: never });

/** Parameters for `subscriptions.update` (`recurring=update_subscription`). */
export interface SubscriptionUpdateParams extends VaultPaymentFields {
  subscriptionId: string;
  /** Update the custom plan details of the subscription. */
  plan?: Partial<CustomPlanFields>;
  startDate?: string;
  billing?: BillingAddress;
  orderId?: string;
  orderDescription?: string;
  ponumber?: string;
  processorId?: string;
  customerReceipt?: boolean;
  acuEnabled?: boolean;
  /** Pause/resume the subscription. */
  paused?: boolean;
  merchantDefinedFields?: Record<number, string>;
  extra?: Record<string, string>;
}

/** Approved result for plan operations. */
export interface ApprovedPlanResult extends ApprovedTransaction {
  /** The plan id (echoed from the request; the gateway response when present). */
  planId: string | null;
}
export type PlanResult = ApprovedPlanResult | DeclinedTransaction;

/** Approved result for subscription operations. */
export interface ApprovedSubscriptionResult extends ApprovedTransaction {
  /**
   * The subscription id. The gateway returns it in `subscription_id` on
   * current accounts and in `transactionid` on older ones — mapped defensively.
   */
  subscriptionId: string | null;
}
export type SubscriptionResult = ApprovedSubscriptionResult | DeclinedTransaction;
