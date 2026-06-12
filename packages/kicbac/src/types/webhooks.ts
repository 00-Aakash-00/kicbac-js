/**
 * Webhook event types and bodies. Event bodies stay snake_case, mirroring the
 * gateway payloads byte-for-byte (`Kicbac_API_Docs/Webhooks/Examples`). Every
 * body keeps an `unknown` index signature: the gateway adds fields over time.
 */

export type TransactionAction = "sale" | "auth" | "capture" | "void" | "refund" | "credit";
export type TransactionOutcome = "success" | "failure" | "unknown";

export type TransactionEventType = `transaction.${TransactionAction}.${TransactionOutcome}`;
export type CheckStatusEventType = `transaction.check.status.${"settle" | "return" | "latereturn"}`;
export type RecurringEventType = `recurring.${"plan" | "subscription"}.${"add" | "update" | "delete"}`;
export type SettlementEventType = `settlement.batch.${"complete" | "failure"}`;
export type ChargebackEventType = "chargeback.batch.complete";
export type AcuSummaryEventType = `acu.summary.${"automaticallyupdated" | "closedaccount" | "contactcustomer"}`;

export type KicbacEventType =
  | TransactionEventType
  | CheckStatusEventType
  | RecurringEventType
  | SettlementEventType
  | ChargebackEventType
  | AcuSummaryEventType;

export interface WebhookMerchant {
  id: string | number;
  name: string;
  [key: string]: unknown;
}

export interface WebhookAddress {
  first_name?: string;
  last_name?: string;
  address_1?: string;
  address_2?: string;
  company?: string;
  city?: string;
  state?: string;
  postal_code?: string;
  country?: string;
  email?: string;
  phone?: string;
  cell_phone?: string;
  fax?: string;
  [key: string]: unknown;
}

export interface WebhookCard {
  cc_number?: string;
  cc_exp?: string;
  cc_type?: string;
  cc_bin?: string;
  avs_response?: string;
  csc_response?: string;
  entry_mode?: string;
  [key: string]: unknown;
}

export interface WebhookCheck {
  check_account?: string;
  check_aba?: string;
  check_name?: string;
  account_holder_type?: string;
  account_type?: string;
  sec_code?: string;
  [key: string]: unknown;
}

export interface WebhookAction {
  amount?: string;
  action_type?: string;
  date?: string;
  success?: string;
  ip_address?: string;
  source?: string;
  api_method?: string;
  username?: string;
  response_text?: string;
  response_code?: string;
  processor_response_text?: string;
  processor_response_code?: string;
  [key: string]: unknown;
}

/** Body of `transaction.*` and `transaction.check.status.*` events. */
export interface TransactionEventBody {
  merchant?: WebhookMerchant;
  features?: { is_test_mode?: boolean; [key: string]: unknown };
  transaction_id?: string;
  transaction_type?: string;
  condition?: string;
  processor_id?: string;
  order_id?: string;
  order_description?: string;
  ponumber?: string;
  currency?: string;
  requested_amount?: string;
  partial_payment_id?: string;
  partial_payment_balance?: string;
  authorization_code?: string;
  billing_address?: WebhookAddress;
  shipping_address?: WebhookAddress;
  card?: WebhookCard;
  check?: WebhookCheck;
  action?: WebhookAction;
  [key: string]: unknown;
}

/** Body of `recurring.plan.*` events. */
export interface RecurringPlanEventBody {
  merchant?: WebhookMerchant;
  features?: { is_test_mode?: boolean; [key: string]: unknown };
  id?: string;
  name?: string;
  amount?: string;
  payments?: number;
  day_frequency?: number | null;
  month_frequency?: number | null;
  day_of_month?: number | null;
  [key: string]: unknown;
}

/** Body of `recurring.subscription.*` events. */
export interface RecurringSubscriptionEventBody {
  merchant?: WebhookMerchant;
  features?: { is_test_mode?: boolean; [key: string]: unknown };
  subscription_id?: string;
  subscription_type?: string;
  processor_id?: string;
  next_charge_date?: string;
  completed_payments?: number;
  attempted_payments?: number;
  remaining_payments?: number;
  plan?: {
    id?: string;
    name?: string;
    amount?: string;
    payments?: number;
    day_frequency?: number | null;
    month_frequency?: number | null;
    day_of_month?: number | null;
    [key: string]: unknown;
  };
  billing_address?: WebhookAddress;
  card?: WebhookCard;
  check?: WebhookCheck;
  [key: string]: unknown;
}

/** Body of `settlement.batch.*` events. */
export interface SettlementBatchEventBody {
  merchant?: WebhookMerchant;
  processor?: { id?: string; name?: string; type?: string; [key: string]: unknown };
  batch_id?: string;
  count?: number;
  amount?: string;
  by_card_type?: Record<string, { count?: number; amount?: string }>;
  transaction_ids?: string[];
  [key: string]: unknown;
}

/** Body of `chargeback.batch.complete` events. */
export interface ChargebackBatchEventBody {
  merchant?: WebhookMerchant;
  processor?: { id?: string; name?: string; type?: string; [key: string]: unknown };
  count?: number;
  chargeback_amount?: string;
  chargebacks?: {
    id?: string;
    date?: string;
    customer_name?: string;
    cc_number?: string;
    amount?: string;
    reason?: string;
    [key: string]: unknown;
  }[];
  [key: string]: unknown;
}

/** Body of `acu.summary.*` (Automatic Card Updater) events. */
export interface AcuSummaryEventBody {
  merchant?: WebhookMerchant;
  updated_date?: string;
  cards_checked?: Record<string, { checked?: number; updated?: number }>;
  [key: string]: unknown;
}

export interface TransactionEvent {
  event_id: string;
  event_type: TransactionEventType;
  event_body: TransactionEventBody;
}

export interface CheckStatusEvent {
  event_id: string;
  event_type: CheckStatusEventType;
  event_body: TransactionEventBody;
}

export interface RecurringPlanEvent {
  event_id: string;
  event_type: `recurring.plan.${"add" | "update" | "delete"}`;
  event_body: RecurringPlanEventBody;
}

export interface RecurringSubscriptionEvent {
  event_id: string;
  event_type: `recurring.subscription.${"add" | "update" | "delete"}`;
  event_body: RecurringSubscriptionEventBody;
}

export interface SettlementBatchEvent {
  event_id: string;
  event_type: SettlementEventType;
  event_body: SettlementBatchEventBody;
}

export interface ChargebackBatchEvent {
  event_id: string;
  event_type: ChargebackEventType;
  event_body: ChargebackBatchEventBody;
}

export interface AcuSummaryEvent {
  event_id: string;
  event_type: AcuSummaryEventType;
  event_body: AcuSummaryEventBody;
}

/** A verified webhook event, discriminated by `event_type`. */
export type KicbacEvent =
  | TransactionEvent
  | CheckStatusEvent
  | RecurringPlanEvent
  | RecurringSubscriptionEvent
  | SettlementBatchEvent
  | ChargebackBatchEvent
  | AcuSummaryEvent;
