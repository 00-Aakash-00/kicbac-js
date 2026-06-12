import type {
  BillingAddress,
  CardDetails,
  CheckDetails,
  Money,
  ShippingAddress,
} from "./common";

/**
 * Exactly ONE payment method must be provided per charge-like call
 * (enforced before the request is sent).
 */
export interface PaymentMethodFields {
  /** Single-use Kicbac.js token — the recommended method. */
  paymentToken?: string;
  /** Keyed card entry (PCI scope applies; prefer `paymentToken`). */
  card?: CardDetails;
  /** ACH / electronic check. */
  check?: CheckDetails;
  /** Charge a stored Customer Vault record. */
  customerVaultId?: string;
  /** Encrypted token from a direct Google Pay SDK integration. */
  googlePayData?: string;
  /** Encrypted token from a direct Apple Pay SDK integration (hex-encoded). */
  applePayData?: string;
}

/** Payment descriptor overrides (supported processors only). */
export interface DescriptorFields {
  name?: string;
  phone?: string;
  address?: string;
  city?: string;
  state?: string;
  postal?: string;
  country?: string;
  mcc?: string;
  merchantId?: string;
  url?: string;
}

/** Stored-credential (CIT/MIT) framework fields. */
export interface StoredCredentialFields {
  /** Who initiated the transaction. */
  initiatedBy?: "customer" | "merchant";
  /** `"stored"` on the initial vaulting transaction, `"used"` on follow-ups. */
  storedCredentialIndicator?: "stored" | "used";
  /** Gateway transaction id of the initial customer-initiated transaction. */
  initialTransactionId?: string;
  /** Marks the payment as part of a recurring/installment agreement. */
  billingMethod?: "recurring" | "installment";
}

/** 3-D Secure passthrough values obtained from an external 3DS provider. */
export interface ThreeDsFields {
  cardholderAuth?: "verified" | "attempted";
  /** Cardholder authentication verification value (base64). Redacted in logs. */
  cavv?: string;
  /** Cardholder authentication transaction id (base64). Redacted in logs. */
  xid?: string;
  eci?: string;
  /** e.g. `"2.2.0"`. */
  version?: string;
  directoryServerId?: string;
}

/** Fields shared by sale / authorize / credit / validate / offline. */
export interface ChargeCommonFields extends PaymentMethodFields, StoredCredentialFields {
  billing?: BillingAddress;
  shipping?: ShippingAddress;
  orderId?: string;
  orderDescription?: string;
  ponumber?: string;
  /** ISO 4217, e.g. `"USD"`. */
  currency?: string;
  /** Sales tax included in the amount. */
  tax?: Money;
  /** Shipping amount included in the amount. */
  shippingAmount?: Money;
  /** Cardholder IP address (recommended for fraud screening). */
  ipAddress?: string;
  descriptor?: DescriptorFields;
  /** Custom fields 1-20, e.g. `{ 1: "value" }`. */
  merchantDefinedFields?: Record<number, string>;
  threeDs?: ThreeDsFields;
  /** Duplicate-checking window in seconds (0 disables, max 7862400). */
  dupSeconds?: number;
  /** Process this single transaction in test mode. */
  testMode?: boolean;
  /**
   * Also store the payment in the Customer Vault when the transaction
   * succeeds. Pass `"add"`/`"update"` or `{ action, id }` to choose the
   * vault id (omit `id` to let the gateway generate one).
   */
  vault?: "add" | "update" | { action: "add" | "update"; id?: string };
  /**
   * Escape hatch for raw gateway variables not yet typed by the SDK, merged
   * into the request last.
   *
   * Redaction covers the KNOWN sensitive gateway variable names (`ccnumber`,
   * `cvv`, `payment_token`, `checkaba`, `checkaccount`, ...). It cannot detect
   * a custom or misspelled key, so do NOT put raw card/bank data behind a
   * non-standard key here — it would appear unredacted in logs and errors.
   * Use the typed `card`/`check`/`paymentToken` fields for payment data.
   */
  extra?: Record<string, string>;
}

/** Parameters for `transactions.sale` (charged and flagged for settlement). */
export interface SaleParams extends ChargeCommonFields {
  /** Total amount to charge, as a string like `"49.99"`. */
  amount: Money;
  /** Partial-payment behavior (split-tender). */
  partialPayments?: "settle_partial" | "payment_in_full";
  /** Partial-payment id from the original transaction (secondary payments). */
  partialPaymentId?: string;
}

/** Parameters for `transactions.authorize` (auth only; capture later). */
export type AuthorizeParams = SaleParams;

/** Parameters for `transactions.credit` (push funds to a card). */
export type CreditParams = SaleParams;

/** Parameters for `transactions.validate` — account verification, NO amount. */
export type ValidateParams = Omit<SaleParams, "amount" | "partialPayments" | "partialPaymentId">;

/** Parameters for `transactions.offline` (voice-authorized transactions). */
export interface OfflineParams extends ChargeCommonFields {
  amount: Money;
  /** Authorization code obtained out-of-band. Required. */
  authorizationCode: string;
}

/** Parameters for `transactions.capture`. */
export interface CaptureParams {
  transactionId: string;
  /** Amount to settle; must be <= the original authorization. */
  amount: Money;
  trackingNumber?: string;
  shippingCarrier?: "ups" | "fedex" | "dhl" | "usps";
  orderId?: string;
  extra?: Record<string, string>;
}

/** Gateway-accepted reasons for voiding an EMV transaction. */
export type VoidReason =
  | "fraud"
  | "user_cancel"
  | "icc_rejected"
  | "icc_card_removed"
  | "icc_no_confirmation"
  | "pos_timeout";

/** Parameters for `transactions.void`. */
export interface VoidParams {
  transactionId: string;
  reason?: VoidReason;
  payment?: "creditcard" | "check";
  extra?: Record<string, string>;
}

/** Parameters for `transactions.refund`. Omit `amount` for a full refund. */
export interface RefundParams {
  transactionId: string;
  /** Partial refund amount; omit to refund the entire settled amount. */
  amount?: Money;
  payment?: "creditcard" | "check";
  extra?: Record<string, string>;
}

/** Parameters for `transactions.update` (post-transaction order data). */
export interface UpdateParams {
  transactionId: string;
  payment?: "creditcard" | "check";
  trackingNumber?: string;
  shippingCarrier?: "ups" | "fedex" | "dhl" | "usps";
  /** Shipping date, YYYYMMDD. */
  shippingDate?: string;
  shippingAmount?: Money;
  shippingPostal?: string;
  shipFromPostal?: string;
  shippingCountry?: string;
  orderDescription?: string;
  /** Order date, YYYYMMDD. */
  orderDate?: string;
  ponumber?: string;
  tax?: Money;
  customerReceipt?: boolean;
  merchantDefinedFields?: Record<number, string>;
  extra?: Record<string, string>;
}

/** Parameters for `transactions.completePartialPayment`. */
export interface CompletePartialPaymentParams {
  /** `partial_payment_id` returned by the original transaction. */
  partialPaymentId: string;
  amount?: Money;
  orderId?: string;
  extra?: Record<string, string>;
}
