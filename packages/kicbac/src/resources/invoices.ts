import type { Transport } from "../transport";
import { compactParams, type ParamBag } from "../encode";
import { emptyToNull } from "../decode";
import {
  requireString,
  validateAmount,
  validateMerchantDefinedFields,
  validateOptionalAmount,
} from "../validate";
import { ValidationError } from "../errors";
import type { RequestOptions } from "../types/common";
import type {
  ApprovedInvoiceResult,
  InvoiceCreateParams,
  InvoiceResult,
  InvoiceUpdateParams,
} from "../types/invoices";
import { mapBilling, mapShipping, toTransactionResult } from "./transactions";

function toInvoiceResult(raw: Record<string, string>): InvoiceResult {
  const result = toTransactionResult(raw);
  if (!result.ok) return result;
  const approved: ApprovedInvoiceResult = {
    ...result,
    invoiceId: emptyToNull(raw["invoice_id"]),
  };
  return approved;
}

function mapPaymentTerms(terms: "upon_receipt" | number | undefined): string | undefined {
  if (terms === undefined) return undefined;
  if (terms === "upon_receipt") return terms;
  if (!Number.isInteger(terms) || terms < 0 || terms > 999) {
    throw new ValidationError(
      'Invalid paymentTerms: expected "upon_receipt" or an integer number of days from 0 to 999.',
    );
  }
  return String(terms);
}

function mapInvoiceFields(params: Omit<InvoiceCreateParams, "amount" | "email">): ParamBag {
  return compactParams({
    payment_terms: mapPaymentTerms(params.paymentTerms),
    payment_methods_allowed: params.paymentMethodsAllowed?.join(","),
    processor_id: params.processorId,
    currency: params.currency,
    orderid: params.orderId,
    order_description: params.orderDescription,
    customer_id: params.customerId,
    customer_tax_id: params.customerTaxId,
    tax: validateOptionalAmount(params.tax, "tax", { positive: false }),
    shipping: validateOptionalAmount(params.shippingAmount, "shippingAmount", {
      positive: false,
    }),
    ponumber: params.ponumber,
    website: params.website,
    ...mapBilling(params.billing),
    ...mapShipping(params.shipping),
    ...validateMerchantDefinedFields(params.merchantDefinedFields),
    ...params.extra,
  });
}

/** Invoicing (`transact.php`, `invoicing=...`). */
export class InvoicesResource {
  constructor(private readonly transport: Transport) {}

  /**
   * Create an invoice and email it to the customer
   * (`invoicing=add_invoice`). `amount` must be greater than 0.
   */
  async create(params: InvoiceCreateParams, opts?: RequestOptions): Promise<InvoiceResult> {
    const raw = await this.transport.transact(
      {
        invoicing: "add_invoice",
        amount: validateAmount(params.amount, "amount"),
        email: requireString(params.email, "email"),
        ...mapInvoiceFields(params),
      },
      opts,
    );
    return toInvoiceResult(raw);
  }

  /**
   * Update an existing invoice (`invoicing=update_invoice`). Updating does
   * NOT re-send the invoice — call `send` afterwards.
   */
  async update(params: InvoiceUpdateParams, opts?: RequestOptions): Promise<InvoiceResult> {
    const raw = await this.transport.transact(
      {
        invoicing: "update_invoice",
        invoice_id: requireString(params.invoiceId, "invoiceId"),
        amount: validateOptionalAmount(params.amount, "amount"),
        email: params.email,
        ...mapInvoiceFields(params),
      },
      opts,
    );
    return toInvoiceResult(raw);
  }

  /** Email an invoice to its billing address (`invoicing=send_invoice`). */
  async send(invoiceId: string, opts?: RequestOptions): Promise<InvoiceResult> {
    const raw = await this.transport.transact(
      { invoicing: "send_invoice", invoice_id: requireString(invoiceId, "invoiceId") },
      opts,
    );
    return toInvoiceResult(raw);
  }

  /** Close an open invoice (`invoicing=close_invoice`). */
  async close(invoiceId: string, opts?: RequestOptions): Promise<InvoiceResult> {
    const raw = await this.transport.transact(
      { invoicing: "close_invoice", invoice_id: requireString(invoiceId, "invoiceId") },
      opts,
    );
    return toInvoiceResult(raw);
  }
}
