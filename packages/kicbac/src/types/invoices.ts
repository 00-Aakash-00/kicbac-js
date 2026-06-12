import type {
  ApprovedTransaction,
  BillingAddress,
  DeclinedTransaction,
  Money,
  ShippingAddress,
} from "./common";

/** Parameters for `invoices.create` (`invoicing=add_invoice`). */
export interface InvoiceCreateParams {
  /** Total amount to invoice. Must be greater than 0. */
  amount: Money;
  /** Billing email — the invoice is sent here on creation. Required. */
  email: string;
  /** `"upon_receipt"` (default) or days until due (0-999). */
  paymentTerms?: "upon_receipt" | number;
  /** Payment methods the customer may use, e.g. `["cc", "ck"]`. */
  paymentMethodsAllowed?: ("cc" | "ck" | "cs")[];
  processorId?: string;
  currency?: string;
  orderId?: string;
  orderDescription?: string;
  customerId?: string;
  customerTaxId?: string;
  tax?: Money;
  shippingAmount?: Money;
  ponumber?: string;
  website?: string;
  billing?: BillingAddress;
  shipping?: ShippingAddress;
  merchantDefinedFields?: Record<number, string>;
  extra?: Record<string, string>;
}

/**
 * Parameters for `invoices.update` (`invoicing=update_invoice`). Everything
 * except `currency` may be updated; updating does NOT re-send the invoice —
 * call `invoices.send` afterwards.
 */
export interface InvoiceUpdateParams extends Partial<Omit<InvoiceCreateParams, "email">> {
  /** The invoice to update. Required. */
  invoiceId: string;
  email?: string;
}

/** Approved result for invoice operations. */
export interface ApprovedInvoiceResult extends ApprovedTransaction {
  /** The invoice id from the gateway response (`invoice_id`). */
  invoiceId: string | null;
}
export type InvoiceResult = ApprovedInvoiceResult | DeclinedTransaction;
