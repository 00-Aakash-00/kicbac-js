import type { Transport } from "../transport";
import { compactParams, type ParamBag } from "../encode";
import { AuthenticationError, GatewayError } from "../errors";
import { collectElements, elementToValue, parseXml, type XmlRecord } from "../xml";
import { AUTH_FAILURE_PATTERN } from "../codes";
import { validateMerchantDefinedFields } from "../validate";
import type { RequestOptions } from "../types/common";
import type {
  QueryCommonParams,
  QueryCustomersParams,
  QueryInvoicesParams,
  QueryPlansParams,
  QuerySubscriptionsParams,
  QueryTransactionsParams,
} from "../types/query";

const DEFAULT_PAGE_SIZE = 100;

function joinList(value: string | string[] | undefined): string | undefined {
  if (value === undefined) return undefined;
  return Array.isArray(value) ? value.join(",") : value;
}

/** Read-only reporting via query.php (idempotent: retried on transient failures). */
export class QueryResource {
  constructor(private readonly transport: Transport) {}

  /** Iterate transactions matching the filters (auto-paginates). */
  transactions(
    params: QueryTransactionsParams = {},
    opts?: RequestOptions,
  ): AsyncIterableIterator<XmlRecord> {
    return this.paginate(
      {
        condition: params.condition?.join(","),
        transaction_type: params.transactionType,
        action_type: params.actionType?.join(","),
        source: params.source?.join(","),
        transaction_id: joinList(params.transactionId),
        subscription_id: joinList(params.subscriptionId),
        partial_payment_id: params.partialPaymentId,
        order_id: params.orderId,
        first_name: params.firstName,
        last_name: params.lastName,
        address1: params.address1,
        city: params.city,
        state: params.state,
        zip: params.zip,
        phone: params.phone,
        email: params.email,
        order_description: params.orderDescription,
        cc_number: params.ccNumber,
        ...validateMerchantDefinedFields(params.merchantDefinedFields),
        ...this.commonParams(params),
      },
      "transaction",
      params,
      opts,
    );
  }

  /** Iterate Customer Vault records (`report_type=customer_vault`). */
  customers(
    params: QueryCustomersParams = {},
    opts?: RequestOptions,
  ): AsyncIterableIterator<XmlRecord> {
    return this.paginate(
      {
        report_type: "customer_vault",
        customer_vault_id: params.customerVaultId,
        date_search: params.dateSearch?.join(","),
        ...this.commonParams(params),
      },
      "customer",
      params,
      opts,
    );
  }

  /** Iterate subscriptions (`report_type=recurring`). */
  subscriptions(
    params: QuerySubscriptionsParams = {},
    opts?: RequestOptions,
  ): AsyncIterableIterator<XmlRecord> {
    return this.paginate(
      {
        report_type: "recurring",
        subscription_id: joinList(params.subscriptionId),
        ...this.commonParams(params),
      },
      "subscription",
      params,
      opts,
    );
  }

  /** Iterate recurring plans (`report_type=recurring_plans`). */
  plans(params: QueryPlansParams = {}, opts?: RequestOptions): AsyncIterableIterator<XmlRecord> {
    return this.paginate(
      { report_type: "recurring_plans", ...this.commonParams(params) },
      "plan",
      params,
      opts,
    );
  }

  /** Iterate invoices (`report_type=invoicing`). */
  invoices(
    params: QueryInvoicesParams = {},
    opts?: RequestOptions,
  ): AsyncIterableIterator<XmlRecord> {
    return this.paginate(
      {
        report_type: "invoicing",
        invoice_id: params.invoiceId,
        invoice_status: params.invoiceStatus?.join(","),
        ...this.commonParams(params),
      },
      "invoice",
      params,
      opts,
    );
  }

  /**
   * Escape hatch: run a single query.php request with raw gateway variables
   * (`security_key` is added for you) and return the raw XML body. Use this
   * for report types the SDK does not model (receipt, profile, ...).
   */
  raw(params: Record<string, string | undefined>, opts?: RequestOptions): Promise<string> {
    return this.transport.query(params, opts);
  }

  private commonParams(params: QueryCommonParams): ParamBag {
    return compactParams({
      start_date: params.startDate,
      end_date: params.endDate,
      result_order: params.resultOrder,
      ...params.extra,
    });
  }

  /**
   * Page through results: `page_number` 0..n with `result_limit = pageSize`,
   * stopping when a page comes back smaller than `pageSize`. An empty
   * `<nm_response>` yields an empty iterator.
   */
  private async *paginate(
    baseParams: ParamBag,
    itemTag: string,
    common: QueryCommonParams,
    opts?: RequestOptions,
  ): AsyncIterableIterator<XmlRecord> {
    const pageSize = common.pageSize ?? DEFAULT_PAGE_SIZE;
    for (let page = 0; ; page++) {
      const text = await this.transport.query(
        { ...baseParams, result_limit: String(pageSize), page_number: String(page) },
        opts,
      );
      const root = parseXml(text);
      this.throwOnErrorResponse(root);
      const items = collectElements(root, itemTag);
      for (const item of items) {
        const value = elementToValue(item);
        yield typeof value === "string" ? {} : Array.isArray(value) ? {} : value;
      }
      if (items.length < pageSize) return;
    }
  }

  /** `<error_response>`: auth failures vs everything else. */
  private throwOnErrorResponse(root: ReturnType<typeof parseXml>): void {
    const errors = collectElements(root, "error_response");
    const error = errors[0];
    if (!error) return;
    const text = error.text.trim();
    const details = {
      responseCode: null,
      responseText: text,
      transactionId: null,
      raw: { error_response: text },
    };
    if (AUTH_FAILURE_PATTERN.test(text)) {
      throw new AuthenticationError(
        `Query API authentication failed: ${text}. Check your security key.`,
        details,
      );
    }
    throw new GatewayError(`The Query API returned an error: ${text}.`, details);
  }
}
