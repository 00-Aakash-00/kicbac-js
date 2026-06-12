import { Transport } from "./transport";
import { TransactionsResource } from "./resources/transactions";
import { CustomersResource } from "./resources/customers";
import { PlansResource } from "./resources/plans";
import { SubscriptionsResource } from "./resources/subscriptions";
import { InvoicesResource } from "./resources/invoices";
import { QueryResource } from "./resources/query";
import { Webhooks } from "./webhooks";
import type { KicbacConfig } from "./types/common";

/**
 * Kicbac gateway client.
 *
 * ```ts
 * import Kicbac from "kicbac";
 * const kicbac = new Kicbac(); // uses process.env.KICBAC_SECURITY_KEY
 * const result = await kicbac.transactions.sale({ amount: "49.99", paymentToken: token });
 * if (result.ok) console.log(result.transactionId);
 * ```
 *
 * Declines are returned as `{ ok: false }` results; gateway/transport
 * failures throw errors from the KicbacError taxonomy.
 */
export class Kicbac {
  /** Sales, auths, captures, voids, refunds, credits, validations. */
  readonly transactions: TransactionsResource;
  /** Customer Vault records and vault charges. */
  readonly customers: CustomersResource;
  /** Recurring plans (no delete — the gateway has no delete_plan action). */
  readonly plans: PlansResource;
  /** Recurring subscriptions. */
  readonly subscriptions: SubscriptionsResource;
  /** Invoicing. */
  readonly invoices: InvoicesResource;
  /** Read-only reporting (query.php). */
  readonly query: QueryResource;
  /** Webhook signature verification. */
  readonly webhooks: Webhooks;

  constructor(config: KicbacConfig = {}) {
    const transport = new Transport(config);
    this.transactions = new TransactionsResource(transport);
    this.customers = new CustomersResource(transport);
    this.plans = new PlansResource(transport);
    this.subscriptions = new SubscriptionsResource(transport);
    this.invoices = new InvoicesResource(transport);
    this.query = new QueryResource(transport);
    this.webhooks = new Webhooks();
  }
}
