import type { Transport } from "../transport";
import { compactParams, type ParamBag } from "../encode";
import {
  requireString,
  validateAmount,
  validateDupSeconds,
  validateMerchantDefinedFields,
  validatePaymentMethod,
} from "../validate";
import type { RequestOptions, TransactionResult } from "../types/common";
import type {
  BillingCreateParams,
  BillingUpdateParams,
  CustomerCreateParams,
  CustomerUpdateParams,
  VaultChargeParams,
  VaultPaymentFields,
} from "../types/customers";
import {
  mapBilling,
  mapPaymentMethod,
  mapShipping,
  toTransactionResult,
} from "./transactions";

/** Methods accepted when storing payment data in the vault. */
const VAULT_METHODS = [
  "paymentToken",
  "card",
  "check",
  "googlePayData",
  "applePayData",
  "sourceTransactionId",
] as const;

function mapVaultPayment(params: VaultPaymentFields): ParamBag {
  return compactParams({
    ...mapPaymentMethod(params),
    source_transaction_id: params.sourceTransactionId,
  });
}

/** Customer Vault operations (`transact.php`, `customer_vault=...`). */
export class CustomersResource {
  constructor(private readonly transport: Transport) {}

  /**
   * Store a customer record (`customer_vault=add_customer`). A payment
   * method is required; the gateway returns the resulting
   * `customerVaultId` on the approved result.
   */
  async create(params: CustomerCreateParams, opts?: RequestOptions): Promise<TransactionResult> {
    validatePaymentMethod(params, VAULT_METHODS);
    const raw = await this.transport.transact(
      {
        customer_vault: "add_customer",
        customer_vault_id: params.customerVaultId,
        ...this.commonVaultParams(params),
      },
      opts,
    );
    return toTransactionResult(raw);
  }

  /** Update a stored customer record (`customer_vault=update_customer`). */
  async update(params: CustomerUpdateParams, opts?: RequestOptions): Promise<TransactionResult> {
    validatePaymentMethod(params, VAULT_METHODS, { required: false });
    const raw = await this.transport.transact(
      {
        customer_vault: "update_customer",
        customer_vault_id: requireString(params.customerVaultId, "customerVaultId"),
        ...this.commonVaultParams(params),
      },
      opts,
    );
    return toTransactionResult(raw);
  }

  /** Delete a stored customer record (`customer_vault=delete_customer`). */
  async delete(customerVaultId: string, opts?: RequestOptions): Promise<TransactionResult> {
    const raw = await this.transport.transact(
      {
        customer_vault: "delete_customer",
        customer_vault_id: requireString(customerVaultId, "customerVaultId"),
      },
      opts,
    );
    return toTransactionResult(raw);
  }

  /**
   * Charge a stored customer (`type=sale&customer_vault_id=...`, or
   * `type=auth` when `params.type === "auth"`).
   */
  async charge(params: VaultChargeParams, opts?: RequestOptions): Promise<TransactionResult> {
    const raw = await this.transport.transact(
      {
        type: params.type ?? "sale",
        customer_vault_id: requireString(params.customerVaultId, "customerVaultId"),
        amount: validateAmount(params.amount, "amount"),
        billing_id: params.billingId,
        currency: params.currency,
        processor_id: params.processorId,
        orderid: params.orderId,
        order_description: params.orderDescription,
        descriptor: params.descriptor?.name,
        descriptor_phone: params.descriptor?.phone,
        descriptor_address: params.descriptor?.address,
        descriptor_city: params.descriptor?.city,
        descriptor_state: params.descriptor?.state,
        descriptor_postal: params.descriptor?.postal,
        descriptor_country: params.descriptor?.country,
        descriptor_mcc: params.descriptor?.mcc,
        descriptor_merchant_id: params.descriptor?.merchantId,
        descriptor_url: params.descriptor?.url,
        initiated_by: params.initiatedBy,
        stored_credential_indicator: params.storedCredentialIndicator,
        initial_transaction_id: params.initialTransactionId,
        billing_method: params.billingMethod,
        dup_seconds: validateDupSeconds(params.dupSeconds),
        ...(params.testMode ? { test_mode: "enabled" } : {}),
        ...validateMerchantDefinedFields(params.merchantDefinedFields),
        ...params.extra,
      },
      opts,
    );
    return toTransactionResult(raw);
  }

  /** Add a billing record to a customer (`customer_vault=add_billing`). */
  async addBilling(params: BillingCreateParams, opts?: RequestOptions): Promise<TransactionResult> {
    validatePaymentMethod(params, VAULT_METHODS);
    const raw = await this.transport.transact(
      {
        customer_vault: "add_billing",
        customer_vault_id: requireString(params.customerVaultId, "customerVaultId"),
        billing_id: params.billingId,
        ...mapVaultPayment(params),
        ...mapBilling(params.billing),
        ...params.extra,
      },
      opts,
    );
    return toTransactionResult(raw);
  }

  /** Update a customer's billing record (`customer_vault=update_billing`). */
  async updateBilling(
    params: BillingUpdateParams,
    opts?: RequestOptions,
  ): Promise<TransactionResult> {
    validatePaymentMethod(params, VAULT_METHODS, { required: false });
    const raw = await this.transport.transact(
      {
        customer_vault: "update_billing",
        customer_vault_id: requireString(params.customerVaultId, "customerVaultId"),
        billing_id: requireString(params.billingId, "billingId"),
        ...mapVaultPayment(params),
        ...mapBilling(params.billing),
        ...params.extra,
      },
      opts,
    );
    return toTransactionResult(raw);
  }

  /** Delete a customer's billing record (`customer_vault=delete_billing`). */
  async deleteBilling(
    params: { customerVaultId: string; billingId: string },
    opts?: RequestOptions,
  ): Promise<TransactionResult> {
    const raw = await this.transport.transact(
      {
        customer_vault: "delete_billing",
        customer_vault_id: requireString(params.customerVaultId, "customerVaultId"),
        billing_id: requireString(params.billingId, "billingId"),
      },
      opts,
    );
    return toTransactionResult(raw);
  }

  private commonVaultParams(params: CustomerCreateParams | CustomerUpdateParams): ParamBag {
    return compactParams({
      billing_id: params.billingId,
      shipping_id: params.shippingId,
      ...mapVaultPayment(params),
      ...mapBilling(params.billing),
      ...mapShipping(params.shipping, { includeContact: true }),
      orderid: params.orderId,
      order_description: params.orderDescription,
      currency: params.currency,
      ...(params.acuEnabled !== undefined
        ? { acu_enabled: params.acuEnabled ? "true" : "false" }
        : {}),
      ...validateMerchantDefinedFields(params.merchantDefinedFields),
      ...params.extra,
    });
  }
}
