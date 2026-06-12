import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const dataDir = resolve(here, "../data");
const outFile = resolve(here, "../kicbac.openapi.yaml");
const docsMirror = resolve(here, "../../docs/openapi/kicbac.openapi.yaml");

const testCards = JSON.parse(readFileSync(resolve(dataDir, "test-cards.json"), "utf8"));
const responseCodes = JSON.parse(readFileSync(resolve(dataDir, "response-codes.json"), "utf8"));
const amountSimulation = JSON.parse(readFileSync(resolve(dataDir, "amount-simulation.json"), "utf8"));

const money = {
  type: "string",
  pattern: "^\\d+(\\.\\d{2})$",
  examples: ["49.99"],
  description: "Decimal amount in major currency units."
};

const stringField = (description, extra = {}) => ({
  type: "string",
  description,
  ...extra
});

const nullableString = (description, extra = {}) => ({
  type: ["string", "null"],
  description,
  ...extra
});

const booleanish = {
  type: "string",
  enum: ["true", "false", "1", "0"],
  description: "Gateway boolean form value."
};

const merchant = {
  type: "object",
  additionalProperties: true,
  required: ["id", "name"],
  properties: {
    id: {
      oneOf: [{ type: "string" }, { type: "integer" }],
      description: "Gateway merchant identifier."
    },
    name: stringField("Merchant display name.")
  }
};

const features = {
  type: "object",
  additionalProperties: true,
  properties: {
    is_test_mode: {
      type: "boolean",
      description: "True when the merchant account is running in test mode."
    }
  }
};

const address = {
  type: "object",
  additionalProperties: true,
  properties: {
    first_name: stringField("First name."),
    last_name: stringField("Last name."),
    address_1: stringField("Street address line 1."),
    address_2: stringField("Street address line 2."),
    company: stringField("Company name."),
    city: stringField("City."),
    state: stringField("State or province."),
    postal_code: stringField("Postal or ZIP code."),
    country: stringField("Country code."),
    email: stringField("Email address.", { format: "email" }),
    phone: stringField("Phone number."),
    cell_phone: stringField("Cell phone number."),
    fax: stringField("Fax number.")
  }
};

const cardSummary = {
  type: "object",
  additionalProperties: true,
  properties: {
    cc_number: stringField("Masked card number. Webhook payloads never contain a full PAN."),
    cc_exp: stringField("Expiration date as sent by the gateway."),
    cavv: stringField("3-D Secure CAVV value when present."),
    cavv_result: stringField("3-D Secure CAVV result."),
    xid: stringField("3-D Secure XID."),
    eci: stringField("Electronic commerce indicator."),
    avs_response: stringField("AVS response code."),
    csc_response: stringField("CVV/CSC response code."),
    cardholder_auth: stringField("Cardholder authentication result."),
    cc_start_date: stringField("Card start date when present."),
    cc_issue_number: stringField("Card issue number when present."),
    card_balance: stringField("Card balance when returned."),
    card_available_balance: stringField("Available balance when returned."),
    entry_mode: stringField("Entry mode code."),
    cc_bin: stringField("Card BIN if included."),
    cc_type: stringField("Card brand/type if included.")
  }
};

const checkSummary = {
  type: "object",
  additionalProperties: true,
  properties: {
    check_account: stringField("Masked checking account number."),
    check_aba: stringField("Routing number as reported by the gateway."),
    check_name: stringField("Account holder name."),
    account_holder_type: stringField("Account holder type.", { enum: ["personal", "business", ""] }),
    account_type: stringField("Account type.", { enum: ["checking", "savings", ""] }),
    sec_code: stringField("ACH SEC code.", { examples: ["WEB"] })
  }
};

const action = {
  type: "object",
  additionalProperties: true,
  properties: {
    amount: money,
    action_type: stringField("Gateway action type for this transaction event."),
    date: stringField("Gateway timestamp in YYYYMMDDHHMMSS format."),
    success: stringField("Gateway success flag, usually 1 or 0."),
    ip_address: stringField("Originating IP address when present."),
    source: stringField("Gateway source channel."),
    api_method: stringField("Gateway API method."),
    username: stringField("Gateway username when applicable."),
    response_text: stringField("Gateway response text."),
    response_code: stringField("Gateway response code."),
    processor_response_text: stringField("Processor response text."),
    processor_response_code: stringField("Processor response code."),
    tap_to_mobile: { type: "boolean", description: "Tap to mobile flag when present." },
    device_license_number: stringField("Device license number."),
    device_nickname: stringField("Device nickname.")
  }
};

const processor = {
  type: "object",
  additionalProperties: true,
  properties: {
    id: stringField("Processor identifier."),
    name: stringField("Processor display name."),
    type: stringField("Processor type.", { examples: ["cc", "ck"] })
  }
};

const webhookBase = {
  type: "object",
  additionalProperties: true,
  required: ["event_id", "event_type", "event_body"],
  properties: {
    event_id: stringField("Unique webhook event identifier.", {
      format: "uuid",
      examples: ["9b312dfd-3174-4748-9447-d63c8744305a"]
    }),
    event_type: stringField("Webhook event type."),
    event_body: {
      type: "object",
      additionalProperties: true,
      description: "Event-specific payload."
    }
  }
};

const transactionBody = {
  type: "object",
  additionalProperties: true,
  required: ["merchant", "transaction_id", "transaction_type", "condition", "action"],
  properties: {
    merchant,
    features,
    transaction_id: stringField("Gateway transaction ID."),
    transaction_type: stringField("Gateway transaction payment type.", { enum: ["cc", "ck", "cs", ""] }),
    condition: stringField("Gateway transaction condition."),
    processor_id: stringField("Processor identifier."),
    ponumber: stringField("Purchase order number."),
    order_description: stringField("Order description."),
    order_id: stringField("Merchant order ID."),
    customerid: stringField("Customer ID."),
    customertaxid: stringField("Customer tax ID."),
    website: stringField("Website URL."),
    shipping: stringField("Shipping amount."),
    currency: stringField("Currency code.", { examples: ["USD"] }),
    tax: stringField("Tax amount."),
    surcharge: stringField("Surcharge amount."),
    cash_discount: stringField("Cash discount amount."),
    tip: stringField("Tip amount."),
    requested_amount: money,
    shipping_carrier: stringField("Shipping carrier."),
    tracking_number: stringField("Tracking number."),
    shipping_date: stringField("Shipping date."),
    partial_payment_id: stringField("Partial payment ID."),
    partial_payment_balance: stringField("Partial payment balance."),
    platform_id: stringField("Platform ID."),
    authorization_code: stringField("Authorization code."),
    social_security_number: stringField("Masked social security number when present."),
    drivers_license_number: stringField("Driver license number when present."),
    drivers_license_state: stringField("Driver license state."),
    drivers_license_dob: stringField("Masked driver license date of birth."),
    billing_address: address,
    shipping_address: address,
    card: cardSummary,
    check: checkSummary,
    merchant_defined_fields: {
      type: "object",
      additionalProperties: { type: "string" },
      description: "Merchant-defined fields."
    },
    action
  }
};

const recurringPlan = {
  type: "object",
  additionalProperties: true,
  required: ["merchant", "id", "name", "amount", "payments"],
  properties: {
    merchant,
    features,
    id: stringField("Plan identifier."),
    name: stringField("Plan name."),
    amount: money,
    payments: { type: "integer", description: "Number of payments." },
    day_frequency: nullableString("Days between charges when using day-frequency scheduling."),
    month_frequency: { type: "integer", description: "Months between charges when using monthly scheduling." },
    day_of_month: { type: "integer", description: "Day of month for monthly scheduling." }
  }
};

const recurringSubscription = {
  type: "object",
  additionalProperties: true,
  required: ["merchant", "subscription_id", "subscription_type", "plan"],
  properties: {
    merchant,
    features,
    subscription_id: stringField("Subscription identifier."),
    subscription_type: stringField("Payment type.", { enum: ["cc", "ck", ""] }),
    processor_id: stringField("Processor identifier."),
    next_charge_date: stringField("Next charge date.", { format: "date" }),
    completed_payments: { type: "integer", description: "Completed payment count." },
    attempted_payments: { type: "integer", description: "Attempted payment count." },
    remaining_payments: { type: "integer", description: "Remaining payment count." },
    ponumber: stringField("Purchase order number."),
    order_id: stringField("Order ID."),
    order_description: stringField("Order description."),
    shipping: stringField("Shipping amount."),
    tax: stringField("Tax amount."),
    website: stringField("Website URL."),
    plan: recurringPlan,
    billing_address: address,
    card: cardSummary,
    check: checkSummary
  }
};

const acuCardRecord = {
  type: "object",
  additionalProperties: true,
  properties: {
    customer_vault_id: stringField("Customer Vault ID."),
    billing_id: stringField("Billing record ID."),
    subscription_id: stringField("Recurring subscription ID."),
    cc_number: stringField("Masked card number."),
    cc_exp: stringField("Updated expiration date."),
    first_name: stringField("First name."),
    last_name: stringField("Last name."),
    email: stringField("Email address."),
    phone: stringField("Phone number.")
  }
};

const acuBody = {
  type: "object",
  additionalProperties: true,
  required: ["updated_date", "merchant", "cards_checked"],
  properties: {
    updated_date: stringField("ACU summary date.", { format: "date" }),
    merchant,
    cards_checked: {
      type: "object",
      additionalProperties: true,
      properties: {
        customer_vault: {
          type: "object",
          properties: {
            checked: { type: "integer" },
            updated: { type: "integer" }
          },
          additionalProperties: true
        },
        subscriptions: {
          type: "object",
          properties: {
            checked: { type: "integer" },
            updated: { type: "integer" }
          },
          additionalProperties: true
        }
      }
    },
    vault_updates: { type: "array", items: acuCardRecord },
    recurring_updates: { type: "array", items: acuCardRecord },
    vault_updated_cards: { type: "array", items: acuCardRecord },
    vault_updated_expiration_dates: { type: "array", items: acuCardRecord },
    recurring_updated_cards: { type: "array", items: acuCardRecord },
    recurring_updated_expiration_dates: { type: "array", items: acuCardRecord }
  }
};

const chargebackBody = {
  type: "object",
  additionalProperties: true,
  required: ["merchant", "processor", "count", "chargebacks"],
  properties: {
    merchant,
    processor,
    count: { type: "integer", description: "Number of chargebacks in the batch." },
    chargeback_amount: money,
    chargebacks: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: true,
        properties: {
          id: stringField("Chargeback ID."),
          date: stringField("Chargeback date."),
          customer_name: stringField("Customer name."),
          cc_number: stringField("Masked card number."),
          amount: money,
          reason: stringField("Chargeback reason.")
        }
      }
    }
  }
};

const settlementCompleteBody = {
  type: "object",
  additionalProperties: true,
  required: ["batch_id", "count", "amount", "merchant", "processor"],
  properties: {
    batch_id: stringField("Settlement batch ID."),
    count: { type: "integer", description: "Number of transactions in the batch." },
    amount: money,
    merchant,
    processor,
    by_card_type: {
      type: "object",
      additionalProperties: {
        type: "object",
        properties: {
          count: { type: "integer" },
          amount: money
        },
        additionalProperties: true
      }
    },
    transaction_ids: {
      type: "array",
      items: { type: "string" }
    }
  }
};

const settlementFailureBody = {
  type: "object",
  additionalProperties: true,
  required: ["batch_id", "merchant", "processor"],
  properties: {
    batch_id: stringField("Settlement batch ID."),
    merchant,
    processor
  }
};

const envelope = (eventType, bodyRef) => ({
  allOf: [
    { $ref: "#/components/schemas/WebhookEnvelope" },
    {
      type: "object",
      required: ["event_type", "event_body"],
      properties: {
        event_type: { type: "string", const: eventType },
        event_body: { $ref: bodyRef }
      }
    }
  ]
});

const webhookOperation = (eventType, schemaName) => ({
  post: {
    tags: ["Webhooks"],
    operationId: `receive${eventType.split(".").map((part) => part[0].toUpperCase() + part.slice(1)).join("")}`,
    summary: `${eventType} webhook`,
    description:
      "Kicbac sends this JSON payload to your HTTPS endpoint. Verify the Webhook-Signature header before parsing or acting on the event.",
    parameters: [{ $ref: "#/components/parameters/WebhookSignature" }],
    requestBody: {
      required: true,
      content: {
        "application/json": {
          schema: { $ref: `#/components/schemas/${schemaName}` }
        }
      }
    },
    responses: {
      "200": {
        description: "Return HTTP 200 only after the event is verified and accepted."
      }
    }
  }
});

const transactionEventTypes = [
  "transaction.sale.success",
  "transaction.check.status.settle",
  "transaction.check.status.return",
  "transaction.check.status.latereturn"
];

const recurringPlanEvents = [
  "recurring.plan.add",
  "recurring.plan.update",
  "recurring.plan.delete"
];

const recurringSubscriptionEvents = [
  "recurring.subscription.add",
  "recurring.subscription.update",
  "recurring.subscription.delete"
];

const acuEvents = [
  "acu.summary.automaticallyupdated",
  "acu.summary.closedaccount",
  "acu.summary.contactcustomer"
];

const webhookSchemas = {};
for (const eventType of transactionEventTypes) {
  webhookSchemas[toSchemaName(eventType)] = envelope(eventType, "#/components/schemas/TransactionWebhookBody");
}
for (const eventType of recurringPlanEvents) {
  webhookSchemas[toSchemaName(eventType)] = envelope(eventType, "#/components/schemas/RecurringPlanWebhookBody");
}
for (const eventType of recurringSubscriptionEvents) {
  webhookSchemas[toSchemaName(eventType)] = envelope(eventType, "#/components/schemas/RecurringSubscriptionWebhookBody");
}
for (const eventType of acuEvents) {
  webhookSchemas[toSchemaName(eventType)] = envelope(eventType, "#/components/schemas/AutomaticCardUpdaterWebhookBody");
}

function toSchemaName(eventType) {
  return `${eventType.split(".").map((part) => part[0].toUpperCase() + part.slice(1)).join("")}Webhook`;
}

const webhookMap = {};
for (const eventType of [
  ...transactionEventTypes,
  ...recurringPlanEvents,
  ...recurringSubscriptionEvents,
  "settlement.batch.complete",
  "settlement.batch.failure",
  "chargeback.batch.complete",
  ...acuEvents
]) {
  webhookMap[eventType] = webhookOperation(eventType, toSchemaName(eventType));
}

const spec = {
  openapi: "3.1.0",
  info: {
    title: "Kicbac Gateway API",
    version: "2026-06-12",
    description:
      "Classic form-encoded Kicbac gateway API, Collect.js tokenized payment fields, Query API reporting, and webhook delivery contracts."
  },
  servers: [
    {
      url: "https://kicbac.transactiongateway.com",
      description: "Kicbac gateway"
    }
  ],
  tags: [
    { name: "Payment API", description: "Form-encoded transaction, vault, recurring, and invoice operations." },
    { name: "Query API", description: "Form-encoded reporting and lookup endpoint." },
    { name: "Webhooks", description: "HTTPS event deliveries signed with Webhook-Signature." }
  ],
  paths: {
    "/api/transact.php": {
      post: {
        tags: ["Payment API"],
        operationId: "submitTransaction",
        summary: "Submit a gateway operation",
        description:
          "Use this endpoint for sales, authorizations, captures, voids, refunds, Customer Vault operations, recurring plans/subscriptions, and invoices. Tokenize browser payment details with Collect.js and send payment_token; do not post raw PAN/CVV from merchant servers.",
        requestBody: {
          required: true,
          content: {
            "application/x-www-form-urlencoded": {
              schema: { $ref: "#/components/schemas/TransactRequest" },
              examples: {
                saleWithPaymentToken: {
                  summary: "Card sale with a Collect.js test token",
                  value: {
                    security_key: "test_security_key",
                    type: "sale",
                    amount: "49.99",
                    payment_token: testCards.payment_tokens.card,
                    orderid: "order_1001"
                  }
                },
                achSaleWithPaymentToken: {
                  summary: "ACH sale with a Collect.js test token",
                  value: {
                    security_key: "test_security_key",
                    type: "sale",
                    payment: "check",
                    amount: "19.99",
                    payment_token: testCards.payment_tokens.ach,
                    orderid: "ach_order_1001"
                  }
                },
                followUpMitCharge: {
                  summary: "Follow-up merchant-initiated stored credential charge",
                  value: {
                    security_key: "test_security_key",
                    type: "sale",
                    amount: "9.99",
                    customer_vault_id: "123456789",
                    initiated_by: "merchant",
                    stored_credential_indicator: "used",
                    initial_transaction_id: "9876543210"
                  }
                }
              }
            }
          }
        },
        responses: {
          "200": {
            description:
              "Gateway operation result. HTTP 200 does not mean approved; inspect response. response=1 is approved, response=2 is a typed decline result, response=3 is a gateway/processor error.",
            content: {
              "application/x-www-form-urlencoded": {
                schema: { $ref: "#/components/schemas/GatewayResponse" },
                examples: {
                  approved: {
                    value: {
                      response: "1",
                      responsetext: "SUCCESS",
                      authcode: "123456",
                      transactionid: "1234560000",
                      response_code: "100"
                    }
                  },
                  declined: {
                    value: {
                      response: "2",
                      responsetext: "DECLINE",
                      transactionid: "1234560001",
                      response_code: "200"
                    }
                  },
                  error: {
                    value: {
                      response: "3",
                      responsetext: "Rate limit exceeded",
                      response_code: "301"
                    }
                  }
                }
              },
              "text/plain": {
                schema: { type: "string" },
                examples: {
                  approved: {
                    value: "response=1&responsetext=SUCCESS&authcode=123456&transactionid=1234560000&response_code=100"
                  }
                }
              }
            }
          }
        }
      }
    },
    "/api/query.php": {
      post: {
        tags: ["Query API"],
        operationId: "queryGateway",
        summary: "Query transactions and reports",
        description:
          "Query reporting data, transactions, Customer Vault records, recurring records, invoice records, profile information, and test-mode status. This endpoint is safe for SDK retry logic; transact.php POSTs are not.",
        requestBody: {
          required: true,
          content: {
            "application/x-www-form-urlencoded": {
              schema: { $ref: "#/components/schemas/QueryRequest" },
              examples: {
                transactionByOrder: {
                  value: {
                    security_key: "test_security_key",
                    order_id: "order_1001"
                  }
                },
                testModeStatus: {
                  value: {
                    security_key: "test_security_key",
                    report_type: "test_mode_status"
                  }
                }
              }
            }
          }
        },
        responses: {
          "200": {
            description: "XML query response.",
            content: {
              "application/xml": {
                schema: { type: "string" },
                examples: {
                  transaction: {
                    value:
                      "<nm_response><transaction><transaction_id>1234560000</transaction_id><condition>pendingsettlement</condition></transaction></nm_response>"
                  }
                }
              },
              "text/xml": {
                schema: { type: "string" }
              }
            }
          }
        }
      }
    }
  },
  webhooks: webhookMap,
  components: {
    parameters: {
      WebhookSignature: {
        name: "Webhook-Signature",
        in: "header",
        required: true,
        schema: {
          type: "string",
          pattern: "^t=[^,]+,s=[A-Fa-f0-9]{64}$",
          examples: ["t=a1b2c3d4e5f60718,s=48414960bf65c35db74773135fc0ba87daab35395dbefca4f4df2a25ea651759"]
        },
        description:
          "Signature header. Verify HMAC-SHA256(signingKey, nonce + '.' + rawBody) where nonce is t and signature is s."
      }
    },
    schemas: {
      TransactRequest: {
        type: "object",
        additionalProperties: {
          type: "string",
          description: "Gateway supports additional documented processor and Level II/III fields."
        },
        required: ["security_key"],
        properties: {
          security_key: stringField("Private gateway security key. Never expose this value in browser code."),
          type: stringField("Transaction operation type.", {
            enum: ["sale", "auth", "credit", "validate", "offline", "capture", "void", "refund", "update"]
          }),
          payment: stringField("Payment rail selector.", { enum: ["creditcard", "check", "cash", ""] }),
          amount: money,
          payment_token: stringField("Single-use Collect.js token. Preferred for card and ACH payments.", {
            examples: [testCards.payment_tokens.card, testCards.payment_tokens.ach]
          }),
          customer_vault_id: stringField("Customer Vault customer identifier."),
          customer_vault: stringField("Customer Vault operation.", {
            enum: ["add_customer", "update_customer", "delete_customer", ""]
          }),
          billing_id: stringField("Customer Vault billing record identifier."),
          source_transaction_id: stringField("Transaction ID to copy card data or vault a previous payment."),
          transactionid: stringField("Existing transaction ID for capture, void, refund, or update."),
          authorization_code: stringField("Authorization code for offline transactions."),
          dup_seconds: stringField("Gateway duplicate window in seconds."),
          currency: stringField("Currency code.", { examples: ["USD"] }),
          orderid: stringField("Merchant order ID."),
          order_description: stringField("Order description."),
          ponumber: stringField("Purchase order number."),
          first_name: stringField("Billing first name."),
          last_name: stringField("Billing last name."),
          address1: stringField("Billing address line 1."),
          address2: stringField("Billing address line 2."),
          city: stringField("Billing city."),
          state: stringField("Billing state."),
          zip: stringField("Billing ZIP/postal code."),
          country: stringField("Billing country."),
          email: stringField("Billing email."),
          phone: stringField("Billing phone."),
          shipping_firstname: stringField("Shipping first name."),
          shipping_lastname: stringField("Shipping last name."),
          shipping_address1: stringField("Shipping address line 1."),
          shipping_address2: stringField("Shipping address line 2."),
          shipping_city: stringField("Shipping city."),
          shipping_state: stringField("Shipping state."),
          shipping_zip: stringField("Shipping ZIP/postal code."),
          shipping_country: stringField("Shipping country."),
          checkaba: stringField("ACH routing number. Prefer Collect.js ACH tokens when collecting in browser."),
          checkaccount: stringField("ACH account number. Prefer Collect.js ACH tokens when collecting in browser."),
          checkname: stringField("ACH account holder name."),
          account_holder_type: stringField("ACH account holder type.", { enum: ["personal", "business", ""] }),
          account_type: stringField("ACH account type.", { enum: ["checking", "savings", ""] }),
          sec_code: stringField("ACH SEC code.", { examples: ["WEB"] }),
          initiated_by: stringField("Stored credential initiator.", { enum: ["customer", "merchant", ""] }),
          stored_credential_indicator: stringField("Stored credential indicator.", {
            enum: ["stored", "used", ""]
          }),
          initial_transaction_id: stringField("Original CIT transaction ID for follow-up MIT charges."),
          billing_method: stringField("Billing method for credential-on-file recurring/standing instruction flows."),
          recurring: stringField("Recurring operation.", {
            enum: [
              "add_plan",
              "edit_plan",
              "add_subscription",
              "update_subscription",
              "delete_subscription",
              ""
            ]
          }),
          plan_id: stringField("Recurring plan ID."),
          current_plan_id: stringField("Existing recurring plan ID when editing a plan."),
          plan_name: stringField("Recurring plan name."),
          payments: stringField("Number of recurring payments."),
          day_frequency: stringField("Days between recurring charges."),
          month_frequency: stringField("Months between recurring charges."),
          day_of_month: stringField("Day of month for recurring charges."),
          start_date: stringField("Subscription start date."),
          subscription_id: stringField("Subscription ID."),
          invoicing: stringField("Invoice operation.", {
            enum: ["add_invoice", "update_invoice", "send_invoice", "close_invoice", ""]
          }),
          invoice_id: stringField("Invoice ID."),
          payment_terms: stringField("Invoice payment terms."),
          payment_methods_allowed: stringField("Comma-separated invoice payment methods."),
          customer_receipt: booleanish,
          merchant_defined_field_1: stringField("Merchant-defined field 1."),
          merchant_defined_field_2: stringField("Merchant-defined field 2."),
          merchant_defined_field_3: stringField("Merchant-defined field 3.")
        }
      },
      QueryRequest: {
        type: "object",
        additionalProperties: { type: "string" },
        required: ["security_key"],
        properties: {
          security_key: stringField("Private gateway security key."),
          condition: stringField("Transaction condition filter."),
          transaction_type: stringField("Transaction type filter."),
          action_type: stringField("Action type filter."),
          source: stringField("Transaction source filter."),
          transaction_id: stringField("Gateway transaction ID."),
          subscription_id: stringField("Recurring subscription ID."),
          invoice_id: stringField("Invoice ID."),
          partial_payment_id: stringField("Partial payment ID."),
          order_id: stringField("Merchant order ID."),
          first_name: stringField("Customer first name."),
          last_name: stringField("Customer last name."),
          email: stringField("Customer email."),
          cc_number: stringField("Card number filter as allowed by the gateway."),
          start_date: stringField("Start timestamp/date filter."),
          end_date: stringField("End timestamp/date filter."),
          report_type: stringField("Special report type.", {
            enum: [
              "receipt",
              "customer_vault",
              "recurring",
              "recurring_plans",
              "invoicing",
              "gateway_processors",
              "account_updater",
              "test_mode_status",
              "profile",
              ""
            ]
          }),
          result_limit: stringField("Maximum results per page."),
          page_number: stringField("Page number for paginated reports."),
          processor_details: booleanish
        }
      },
      GatewayResponse: {
        type: "object",
        additionalProperties: { type: "string" },
        required: ["response", "responsetext"],
        properties: {
          response: {
            type: "string",
            enum: ["1", "2", "3"],
            description:
              "1 approved, 2 declined typed result, 3 gateway or processor error."
          },
          responsetext: stringField("Human-readable response text."),
          response_code: stringField("Gateway result code."),
          authcode: stringField("Authorization code for approved card transactions."),
          transactionid: stringField("Gateway transaction ID."),
          avsresponse: stringField("AVS response code."),
          cvvresponse: stringField("CVV response code."),
          orderid: stringField("Merchant order ID."),
          customer_vault_id: stringField("Customer Vault ID when created or returned."),
          invoice_id: stringField("Invoice ID when created."),
          subscription_id: stringField("Subscription ID when created."),
          partial_payment_id: stringField("Partial payment ID."),
          partial_payment_balance: stringField("Partial payment balance."),
          amount_authorized: stringField("Amount authorized.")
        },
        "x-kicbac-response-codes": responseCodes.codes,
        "x-kicbac-test-amount-simulation": amountSimulation.cases
      },
      WebhookEnvelope: webhookBase,
      Merchant: merchant,
      Features: features,
      Address: address,
      CardSummary: cardSummary,
      CheckSummary: checkSummary,
      TransactionAction: action,
      Processor: processor,
      TransactionWebhookBody: transactionBody,
      RecurringPlanWebhookBody: recurringPlan,
      RecurringSubscriptionWebhookBody: recurringSubscription,
      SettlementBatchCompleteWebhookBody: settlementCompleteBody,
      SettlementBatchFailureWebhookBody: settlementFailureBody,
      ChargebackBatchCompleteWebhookBody: chargebackBody,
      AutomaticCardUpdaterWebhookBody: acuBody,
      SettlementBatchCompleteWebhook: envelope("settlement.batch.complete", "#/components/schemas/SettlementBatchCompleteWebhookBody"),
      SettlementBatchFailureWebhook: envelope("settlement.batch.failure", "#/components/schemas/SettlementBatchFailureWebhookBody"),
      ChargebackBatchCompleteWebhook: envelope("chargeback.batch.complete", "#/components/schemas/ChargebackBatchCompleteWebhookBody"),
      ...webhookSchemas
    }
  }
};

writeFileSync(outFile, `${JSON.stringify(spec, null, 2)}\n`);
if (existsSync(resolve(here, "../../docs"))) {
  mkdirSync(dirname(docsMirror), { recursive: true });
  writeFileSync(docsMirror, `${JSON.stringify(spec, null, 2)}\n`);
}
console.log(`Wrote ${outFile}`);
