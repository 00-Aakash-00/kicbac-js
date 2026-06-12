import type { Transport } from "../transport";
import { compactParams, type ParamBag } from "../encode";
import { emptyToNull, intOrNull } from "../decode";
import {
  requireString,
  validateAmount,
  validateDupSeconds,
  validateMerchantDefinedFields,
  validateOptionalAmount,
  validatePaymentMethod,
} from "../validate";
import type {
  ApprovedTransaction,
  BillingAddress,
  DeclinedTransaction,
  RequestOptions,
  ShippingAddress,
  TransactionResult,
} from "../types/common";
import type {
  AuthorizeParams,
  CaptureParams,
  ChargeCommonFields,
  CompletePartialPaymentParams,
  CreditParams,
  OfflineParams,
  RefundParams,
  SaleParams,
  UpdateParams,
  ValidateParams,
  VoidParams,
} from "../types/transactions";

/*
 * Param-name mapping tables. The gateway's variable names are irregular
 * (ccnumber, orderid, first_name, shipping_firstname, dup_seconds, ...);
 * every name below is verbatim from Kicbac-Direct-Post-API.pdf pp. 4-16.
 */

/** Billing fields -> gateway names (PDF p. 6: first_name ... email). */
export function mapBilling(billing: BillingAddress | undefined): ParamBag {
  if (!billing) return {};
  return compactParams({
    first_name: billing.firstName,
    last_name: billing.lastName,
    company: billing.company,
    address1: billing.address1,
    address2: billing.address2,
    city: billing.city,
    state: billing.state,
    zip: billing.zip,
    country: billing.country,
    phone: billing.phone,
    fax: billing.fax,
    email: billing.email,
  });
}

/**
 * Shipping fields -> gateway names (PDF p. 6: shipping_firstname ...).
 * `includeContact` adds shipping_phone/shipping_fax, which exist only in the
 * Customer Vault variable set (PDF p. 34).
 */
export function mapShipping(
  shipping: ShippingAddress | undefined,
  { includeContact = false }: { includeContact?: boolean } = {},
): ParamBag {
  if (!shipping) return {};
  return compactParams({
    shipping_firstname: shipping.firstName,
    shipping_lastname: shipping.lastName,
    shipping_company: shipping.company,
    shipping_address1: shipping.address1,
    shipping_address2: shipping.address2,
    shipping_city: shipping.city,
    shipping_state: shipping.state,
    shipping_zip: shipping.zip,
    shipping_country: shipping.country,
    shipping_email: shipping.email,
    ...(includeContact
      ? { shipping_phone: shipping.phone, shipping_fax: shipping.fax }
      : {}),
  });
}

/** One-of payment method -> gateway names (PDF pp. 4-5). */
export function mapPaymentMethod(params: {
  paymentToken?: string | undefined;
  card?: { number: string; expiry: string; cvv?: string | undefined } | undefined;
  check?:
    | {
        name: string;
        routing: string;
        account: string;
        accountHolderType?: "business" | "personal" | undefined;
        accountType?: "checking" | "savings" | undefined;
        secCode?: "PPD" | "WEB" | "TEL" | "CCD" | undefined;
      }
    | undefined;
  customerVaultId?: string | undefined;
  googlePayData?: string | undefined;
  applePayData?: string | undefined;
}): ParamBag {
  return compactParams({
    payment_token: params.paymentToken,
    ccnumber: params.card?.number,
    ccexp: params.card?.expiry,
    cvv: params.card?.cvv,
    checkname: params.check?.name,
    checkaba: params.check?.routing,
    checkaccount: params.check?.account,
    account_holder_type: params.check?.accountHolderType,
    account_type: params.check?.accountType,
    sec_code: params.check?.secCode,
    ...(params.check ? { payment: "check" } : {}),
    customer_vault_id: params.customerVaultId,
    googlepay_payment_data: params.googlePayData,
    applepay_payment_data: params.applePayData,
  });
}

/** Fields common to sale/auth/credit/validate/offline -> gateway names. */
export function mapChargeCommon(params: ChargeCommonFields): ParamBag {
  const vault = params.vault;
  const vaultAction = typeof vault === "string" ? vault : vault?.action;
  const vaultId = typeof vault === "object" ? vault.id : undefined;
  return compactParams({
    ...mapPaymentMethod(params),
    ...mapBilling(params.billing),
    ...mapShipping(params.shipping),
    orderid: params.orderId,
    order_description: params.orderDescription,
    ponumber: params.ponumber,
    currency: params.currency,
    tax: validateOptionalAmount(params.tax, "tax", { positive: false }),
    shipping: validateOptionalAmount(params.shippingAmount, "shippingAmount", {
      positive: false,
    }),
    ipaddress: params.ipAddress,
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
    ...validateMerchantDefinedFields(params.merchantDefinedFields),
    initiated_by: params.initiatedBy,
    stored_credential_indicator: params.storedCredentialIndicator,
    initial_transaction_id: params.initialTransactionId,
    billing_method: params.billingMethod,
    cardholder_auth: params.threeDs?.cardholderAuth,
    cavv: params.threeDs?.cavv,
    xid: params.threeDs?.xid,
    eci: params.threeDs?.eci,
    three_ds_version: params.threeDs?.version,
    directory_server_id: params.threeDs?.directoryServerId,
    dup_seconds: validateDupSeconds(params.dupSeconds),
    ...(params.testMode ? { test_mode: "enabled" } : {}),
    ...(vaultAction
      ? { customer_vault: vaultAction === "add" ? "add_customer" : "update_customer" }
      : {}),
    ...(vaultId !== undefined ? { customer_vault_id: vaultId } : {}),
    ...params.extra,
  });
}

/** Map a decoded response=1|2 record to the typed result union. */
export function toTransactionResult(raw: Record<string, string>): TransactionResult {
  const responseCode = intOrNull(raw["response_code"]) ?? 0;
  if (raw["response"] === "1") {
    const approved: ApprovedTransaction = {
      ok: true,
      transactionId: raw["transactionid"] ?? "",
      authCode: emptyToNull(raw["authcode"]),
      responseCode,
      responseText: raw["responsetext"] ?? "",
      avsResponse: emptyToNull(raw["avsresponse"]),
      cvvResponse: emptyToNull(raw["cvvresponse"]),
      orderId: emptyToNull(raw["orderid"]),
      customerVaultId: emptyToNull(raw["customer_vault_id"]),
      partialPaymentId: emptyToNull(raw["partial_payment_id"]),
      partialPaymentBalance: emptyToNull(raw["partial_payment_balance"]),
      amountAuthorized: emptyToNull(raw["amount_authorized"]),
      raw,
    };
    return approved;
  }
  const declined: DeclinedTransaction = {
    ok: false,
    code: responseCode,
    message: raw["responsetext"] ?? "",
    transactionId: emptyToNull(raw["transactionid"]),
    avsResponse: emptyToNull(raw["avsresponse"]),
    cvvResponse: emptyToNull(raw["cvvresponse"]),
    orderId: emptyToNull(raw["orderid"]),
    raw,
  };
  return declined;
}

/** Payment API transaction actions (`transact.php`). */
export class TransactionsResource {
  constructor(private readonly transport: Transport) {}

  /** Charge immediately and flag for settlement (`type=sale`). */
  async sale(params: SaleParams, opts?: RequestOptions): Promise<TransactionResult> {
    validatePaymentMethod(params);
    const raw = await this.transport.transact(
      {
        type: "sale",
        amount: validateAmount(params.amount, "amount"),
        partial_payments: params.partialPayments,
        partial_payment_id: params.partialPaymentId,
        ...mapChargeCommon(params),
      },
      opts,
    );
    return toTransactionResult(raw);
  }

  /** Authorize only — funds are held until `capture` (`type=auth`). */
  async authorize(params: AuthorizeParams, opts?: RequestOptions): Promise<TransactionResult> {
    validatePaymentMethod(params);
    const raw = await this.transport.transact(
      {
        type: "auth",
        amount: validateAmount(params.amount, "amount"),
        partial_payments: params.partialPayments,
        partial_payment_id: params.partialPaymentId,
        ...mapChargeCommon(params),
      },
      opts,
    );
    return toTransactionResult(raw);
  }

  /** Flag an existing authorization for settlement (`type=capture`). */
  async capture(params: CaptureParams, opts?: RequestOptions): Promise<TransactionResult> {
    const raw = await this.transport.transact(
      {
        type: "capture",
        transactionid: requireString(params.transactionId, "transactionId"),
        amount: validateAmount(params.amount, "amount"),
        tracking_number: params.trackingNumber,
        shipping_carrier: params.shippingCarrier,
        orderid: params.orderId,
        ...params.extra,
      },
      opts,
    );
    return toTransactionResult(raw);
  }

  /** Cancel an unsettled sale or captured authorization (`type=void`). */
  async void(params: VoidParams, opts?: RequestOptions): Promise<TransactionResult> {
    const raw = await this.transport.transact(
      {
        type: "void",
        transactionid: requireString(params.transactionId, "transactionId"),
        void_reason: params.reason,
        payment: params.payment,
        ...params.extra,
      },
      opts,
    );
    return toTransactionResult(raw);
  }

  /**
   * Reverse a settled (or pending-settlement) transaction (`type=refund`).
   * Omit `amount` to refund the full settled amount.
   */
  async refund(params: RefundParams, opts?: RequestOptions): Promise<TransactionResult> {
    const raw = await this.transport.transact(
      {
        type: "refund",
        transactionid: requireString(params.transactionId, "transactionId"),
        amount: validateOptionalAmount(params.amount, "amount"),
        payment: params.payment,
        ...params.extra,
      },
      opts,
    );
    return toTransactionResult(raw);
  }

  /** Push funds to a card not previously charged via the gateway (`type=credit`). */
  async credit(params: CreditParams, opts?: RequestOptions): Promise<TransactionResult> {
    validatePaymentMethod(params);
    const raw = await this.transport.transact(
      {
        type: "credit",
        amount: validateAmount(params.amount, "amount"),
        ...mapChargeCommon(params),
      },
      opts,
    );
    return toTransactionResult(raw);
  }

  /**
   * Account verification without an authorization (`type=validate`).
   * The gateway requires the amount to be omitted.
   */
  async validate(params: ValidateParams, opts?: RequestOptions): Promise<TransactionResult> {
    validatePaymentMethod(params);
    const raw = await this.transport.transact(
      { type: "validate", ...mapChargeCommon(params) },
      opts,
    );
    return toTransactionResult(raw);
  }

  /** Attach order/shipping data to a previous transaction (`type=update`). */
  async update(params: UpdateParams, opts?: RequestOptions): Promise<TransactionResult> {
    const raw = await this.transport.transact(
      {
        type: "update",
        transactionid: requireString(params.transactionId, "transactionId"),
        payment: params.payment,
        tracking_number: params.trackingNumber,
        shipping_carrier: params.shippingCarrier,
        shipping_date: params.shippingDate,
        shipping: validateOptionalAmount(params.shippingAmount, "shippingAmount", {
          positive: false,
        }),
        shipping_postal: params.shippingPostal,
        ship_from_postal: params.shipFromPostal,
        shipping_country: params.shippingCountry,
        order_description: params.orderDescription,
        order_date: params.orderDate,
        ponumber: params.ponumber,
        tax: validateOptionalAmount(params.tax, "tax", { positive: false }),
        ...(params.customerReceipt !== undefined
          ? { customer_receipt: params.customerReceipt ? "true" : "false" }
          : {}),
        ...validateMerchantDefinedFields(params.merchantDefinedFields),
        ...params.extra,
      },
      opts,
    );
    return toTransactionResult(raw);
  }

  /** Record a transaction authorized outside the gateway (`type=offline`). */
  async offline(params: OfflineParams, opts?: RequestOptions): Promise<TransactionResult> {
    validatePaymentMethod(params);
    const raw = await this.transport.transact(
      {
        type: "offline",
        authorization_code: requireString(params.authorizationCode, "authorizationCode"),
        amount: validateAmount(params.amount, "amount"),
        ...mapChargeCommon(params),
      },
      opts,
    );
    return toTransactionResult(raw);
  }

  /**
   * Settle a `payment_in_full` transaction that was never collected in full
   * (`type=complete_partial_payment`).
   */
  async completePartialPayment(
    params: CompletePartialPaymentParams,
    opts?: RequestOptions,
  ): Promise<TransactionResult> {
    const raw = await this.transport.transact(
      {
        type: "complete_partial_payment",
        partial_payment_id: requireString(params.partialPaymentId, "partialPaymentId"),
        amount: validateOptionalAmount(params.amount, "amount"),
        orderid: params.orderId,
        ...params.extra,
      },
      opts,
    );
    return toTransactionResult(raw);
  }
}
