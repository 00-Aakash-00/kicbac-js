import type { XmlRecord } from "../xml";

/** Transaction state filters accepted by the Query API. */
export type QueryCondition =
  | "pending"
  | "pendingsettlement"
  | "in_progress"
  | "abandoned"
  | "failed"
  | "canceled"
  | "complete"
  | "unknown";

export type QueryActionType =
  | "sale"
  | "refund"
  | "credit"
  | "auth"
  | "capture"
  | "void"
  | "return";

export type QuerySource =
  | "api"
  | "batch_upload"
  | "mobile"
  | "quickclick"
  | "quickbooks"
  | "recurring"
  | "swipe"
  | "virtual_terminal"
  | "internal";

/** Options shared by all query iterators. */
export interface QueryCommonParams {
  /** Modified on/after, YYYYMMDDhhmmss. */
  startDate?: string;
  /** Modified on/before, YYYYMMDDhhmmss. */
  endDate?: string;
  /** `"standard"` oldest-first (default) or `"reverse"` newest-first. */
  resultOrder?: "standard" | "reverse";
  /** Records fetched per page (`result_limit`). Default 100. */
  pageSize?: number;
  /** Escape hatch: raw query.php variables merged into every page request. */
  extra?: Record<string, string>;
}

/** Filters for `query.transactions`. */
export interface QueryTransactionsParams extends QueryCommonParams {
  condition?: QueryCondition[];
  transactionType?: "cc" | "ck";
  actionType?: QueryActionType[];
  source?: QuerySource[];
  transactionId?: string | string[];
  subscriptionId?: string | string[];
  partialPaymentId?: string;
  orderId?: string;
  firstName?: string;
  lastName?: string;
  address1?: string;
  city?: string;
  state?: string;
  zip?: string;
  phone?: string;
  email?: string;
  orderDescription?: string;
  /** Full card number or last 4 digits. */
  ccNumber?: string;
  merchantDefinedFields?: Record<number, string>;
}

/** Filters for `query.customers` (`report_type=customer_vault`). */
export interface QueryCustomersParams extends QueryCommonParams {
  customerVaultId?: string;
  /** Filter the date range by vault creation and/or update date. */
  dateSearch?: ("created" | "updated")[];
}

/** Filters for `query.subscriptions` (`report_type=recurring`). */
export interface QuerySubscriptionsParams extends QueryCommonParams {
  subscriptionId?: string | string[];
}

/** Filters for `query.plans` (`report_type=recurring_plans`). */
export type QueryPlansParams = QueryCommonParams;

/** Filters for `query.invoices` (`report_type=invoicing`). */
export interface QueryInvoicesParams extends QueryCommonParams {
  invoiceId?: string;
  invoiceStatus?: ("open" | "paid" | "closed" | "past_due")[];
}

/**
 * Query records mirror the gateway XML: leaf elements become strings,
 * nested elements become records, repeated tags become arrays
 * (e.g. a transaction's `action` entries).
 */
export type QueryTransactionRecord = XmlRecord;
export type QueryCustomerRecord = XmlRecord;
export type QuerySubscriptionRecord = XmlRecord;
export type QueryPlanRecord = XmlRecord;
export type QueryInvoiceRecord = XmlRecord;
