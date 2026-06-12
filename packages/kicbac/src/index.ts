import { Kicbac } from "./client";

export default Kicbac;
export { Kicbac };

// Errors
export {
  KicbacError,
  ValidationError,
  APIError,
  ConnectionError,
  TimeoutError,
  HttpError,
  ParseError,
  RateLimitError,
  GatewayError,
  AuthenticationError,
  InvalidRequestError,
  ProcessorError,
  SignatureVerificationError,
  WebhookParseError,
  type RedactedRequest,
} from "./errors";

// Webhooks
export { Webhooks, constructEvent, SIGNATURE_HEADER } from "./webhooks";

// Code tables (inlined from openapi/data at build time)
export {
  RESPONSE_CODES,
  AVS_CODES,
  CVV_CODES,
  AUTH_FAILURE_PATTERN,
  type ResponseCodeEntry,
} from "./codes";

// Redaction utilities (safe logging)
export { REDACT_KEYS, redactParams, redactValue } from "./redact";

// Resources (types of the client surface)
export type { TransactionsResource } from "./resources/transactions";
export type { CustomersResource } from "./resources/customers";
export type { PlansResource } from "./resources/plans";
export type { SubscriptionsResource } from "./resources/subscriptions";
export type { InvoicesResource } from "./resources/invoices";
export type { QueryResource } from "./resources/query";

// Common types
export type {
  KicbacConfig,
  RequestOptions,
  LogEntry,
  Money,
  BillingAddress,
  ShippingAddress,
  CardDetails,
  CheckDetails,
  ApprovedTransaction,
  DeclinedTransaction,
  TransactionResult,
} from "./types/common";

// Transaction params
export type {
  PaymentMethodFields,
  DescriptorFields,
  StoredCredentialFields,
  ThreeDsFields,
  ChargeCommonFields,
  SaleParams,
  AuthorizeParams,
  CreditParams,
  ValidateParams,
  OfflineParams,
  CaptureParams,
  VoidParams,
  VoidReason,
  RefundParams,
  UpdateParams,
  CompletePartialPaymentParams,
} from "./types/transactions";

// Customer Vault params
export type {
  VaultPaymentFields,
  CustomerCreateParams,
  CustomerUpdateParams,
  VaultChargeParams,
  BillingCreateParams,
  BillingUpdateParams,
} from "./types/customers";

// Recurring params/results
export type {
  PlanCreateParams,
  PlanUpdateParams,
  CustomPlanFields,
  SubscriptionCommonFields,
  SubscriptionCreateParams,
  SubscriptionUpdateParams,
  ApprovedPlanResult,
  PlanResult,
  ApprovedSubscriptionResult,
  SubscriptionResult,
} from "./types/recurring";

// Invoice params/results
export type {
  InvoiceCreateParams,
  InvoiceUpdateParams,
  ApprovedInvoiceResult,
  InvoiceResult,
} from "./types/invoices";

// Query params/records
export type {
  QueryCondition,
  QueryActionType,
  QuerySource,
  QueryCommonParams,
  QueryTransactionsParams,
  QueryCustomersParams,
  QuerySubscriptionsParams,
  QueryPlansParams,
  QueryInvoicesParams,
  QueryTransactionRecord,
  QueryCustomerRecord,
  QuerySubscriptionRecord,
  QueryPlanRecord,
  QueryInvoiceRecord,
} from "./types/query";
export type { XmlRecord, XmlValue } from "./xml";

// Webhook event types
export type {
  KicbacEvent,
  KicbacEventType,
  TransactionEvent,
  CheckStatusEvent,
  RecurringPlanEvent,
  RecurringSubscriptionEvent,
  SettlementBatchEvent,
  ChargebackBatchEvent,
  AcuSummaryEvent,
  TransactionEventType,
  CheckStatusEventType,
  RecurringEventType,
  SettlementEventType,
  ChargebackEventType,
  AcuSummaryEventType,
  TransactionEventBody,
  RecurringPlanEventBody,
  RecurringSubscriptionEventBody,
  SettlementBatchEventBody,
  ChargebackBatchEventBody,
  AcuSummaryEventBody,
  WebhookMerchant,
  WebhookAddress,
  WebhookCard,
  WebhookCheck,
  WebhookAction,
} from "./types/webhooks";
