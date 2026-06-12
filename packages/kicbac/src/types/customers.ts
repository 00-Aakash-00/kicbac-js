import type { BillingAddress, CardDetails, CheckDetails, Money, ShippingAddress } from "./common";
import type { DescriptorFields, StoredCredentialFields } from "./transactions";

/** Payment methods accepted when creating/updating a vault record. */
export interface VaultPaymentFields {
  /** Single-use Collect.js token — the recommended method. */
  paymentToken?: string;
  card?: CardDetails;
  check?: CheckDetails;
  googlePayData?: string;
  applePayData?: string;
  /** Copy payment data from an existing gateway transaction. */
  sourceTransactionId?: string;
}

/** Parameters for `customers.create` (`customer_vault=add_customer`). */
export interface CustomerCreateParams extends VaultPaymentFields {
  /** Vault id to assign; the gateway generates one when omitted. */
  customerVaultId?: string;
  /** Billing id to assign; one is created when omitted. */
  billingId?: string;
  billing?: BillingAddress;
  shipping?: ShippingAddress;
  /** Shipping entry id. */
  shippingId?: string;
  orderId?: string;
  orderDescription?: string;
  currency?: string;
  /** Automatic Card Updater opt-in/out for this record (default true). */
  acuEnabled?: boolean;
  merchantDefinedFields?: Record<number, string>;
  extra?: Record<string, string>;
}

/** Parameters for `customers.update` (`customer_vault=update_customer`). */
export interface CustomerUpdateParams extends Omit<CustomerCreateParams, "customerVaultId"> {
  /** The vault record to update. Required. */
  customerVaultId: string;
}

/**
 * Parameters for `customers.charge` — a sale (or auth) against a stored
 * Customer Vault record.
 */
export interface VaultChargeParams extends StoredCredentialFields {
  customerVaultId: string;
  amount: Money;
  /** `"sale"` (default) charges immediately; `"auth"` authorizes only. */
  type?: "sale" | "auth";
  /** Charge a specific stored billing record. */
  billingId?: string;
  currency?: string;
  processorId?: string;
  orderId?: string;
  orderDescription?: string;
  descriptor?: DescriptorFields;
  merchantDefinedFields?: Record<number, string>;
  /** Duplicate-checking window in seconds (0 disables, max 7862400). */
  dupSeconds?: number;
  /** Process this single transaction in test mode. */
  testMode?: boolean;
  extra?: Record<string, string>;
}

/** Parameters for `customers.addBilling` (`customer_vault=add_billing`). */
export interface BillingCreateParams extends VaultPaymentFields {
  customerVaultId: string;
  /** Billing id to assign; one is created when omitted. */
  billingId?: string;
  billing?: BillingAddress;
  extra?: Record<string, string>;
}

/** Parameters for `customers.updateBilling` (`customer_vault=update_billing`). */
export interface BillingUpdateParams extends VaultPaymentFields {
  customerVaultId: string;
  /** The billing record to update. Required. */
  billingId: string;
  billing?: BillingAddress;
  extra?: Record<string, string>;
}
