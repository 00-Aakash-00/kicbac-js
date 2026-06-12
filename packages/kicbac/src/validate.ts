import { ValidationError } from "./errors";

/**
 * Pre-network validation. All checks throw ValidationError BEFORE anything is
 * sent. Messages never interpolate caller-provided values (PCI: a card number
 * mistakenly passed as an amount must not leak into logs via an error).
 */

const AMOUNT_RE = /^\d{1,8}(\.\d{1,2})?$/;
const CCEXP_RE = /^(0[1-9]|1[0-2])\d{2}$/;
export const MAX_DUP_SECONDS = 7_862_400;

/** Validate a money string. Returns the value for convenient inline use. */
export function validateAmount(
  value: unknown,
  field: string,
  options: { positive?: boolean } = {},
): string {
  if (typeof value !== "string") {
    throw new ValidationError(
      `Invalid ${field}: amounts must be strings like "49.99", never numbers (floating point is unsafe for money).`,
    );
  }
  if (!AMOUNT_RE.test(value)) {
    throw new ValidationError(
      `Invalid ${field}: expected 1-8 digits with an optional 1-2 digit decimal part, like "49.99" (no commas, no currency symbols).`,
    );
  }
  if (options.positive !== false && Number.parseFloat(value) === 0) {
    throw new ValidationError(`Invalid ${field}: the amount must be greater than zero.`);
  }
  return value;
}

/** Validate an optional money string (undefined passes through). */
export function validateOptionalAmount(
  value: unknown,
  field: string,
  options: { positive?: boolean } = {},
): string | undefined {
  if (value === undefined) return undefined;
  return validateAmount(value, field, options);
}

/** Require a non-empty string identifier (transaction ids, vault ids, ...). */
export function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new ValidationError(`Missing ${field}: expected a non-empty string.`);
  }
  return value;
}

export interface PaymentMethodShape {
  paymentToken?: string | undefined;
  card?: { number: string; expiry: string; cvv?: string | undefined } | undefined;
  check?: { name: string; routing: string; account: string } | undefined;
  customerVaultId?: string | undefined;
  googlePayData?: string | undefined;
  applePayData?: string | undefined;
  /** Vault/subscription operations may copy payment data from a transaction. */
  sourceTransactionId?: string | undefined;
}

/**
 * Enforce exactly one payment method. `allowed` lists the method keys valid
 * for the calling operation (e.g. vault creation has no `customerVaultId`).
 */
export function validatePaymentMethod(
  params: PaymentMethodShape,
  allowed: readonly (keyof PaymentMethodShape)[] = [
    "paymentToken",
    "card",
    "check",
    "customerVaultId",
    "googlePayData",
    "applePayData",
  ],
  { required = true }: { required?: boolean } = {},
): void {
  const present = allowed.filter((key) => params[key] !== undefined);
  if (present.length === 0 && !required) return;
  if (present.length !== 1) {
    const list = allowed.join(", ");
    throw new ValidationError(
      present.length === 0
        ? `Missing payment method: provide exactly one of ${list}.`
        : `Conflicting payment methods: provide exactly one of ${list}.`,
    );
  }
  const card = params.card;
  if (card !== undefined) {
    requireString(card.number, "card.number");
    if (typeof card.expiry !== "string" || !CCEXP_RE.test(card.expiry)) {
      throw new ValidationError(
        'Invalid card.expiry: expected MMYY, e.g. "1029" for October 2029.',
      );
    }
  }
  const check = params.check;
  if (check !== undefined) {
    requireString(check.name, "check.name");
    requireString(check.routing, "check.routing");
    requireString(check.account, "check.account");
  }
}

/** Validate `dup_seconds`: integer seconds, 0 disables, max 7862400. */
export function validateDupSeconds(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > MAX_DUP_SECONDS) {
    throw new ValidationError(
      `Invalid dupSeconds: expected an integer between 0 (disable duplicate checking) and ${MAX_DUP_SECONDS}.`,
    );
  }
  return String(value);
}

/** Validate merchant defined field numbers (1-20). */
export function validateMerchantDefinedFields(
  fields: Record<number | string, string> | undefined,
): Record<string, string> {
  const out: Record<string, string> = {};
  if (fields === undefined) return out;
  for (const [key, value] of Object.entries(fields)) {
    const n = Number(key);
    if (!Number.isInteger(n) || n < 1 || n > 20) {
      throw new ValidationError(
        "Invalid merchantDefinedFields: keys must be integers from 1 to 20 (the gateway supports merchant_defined_field_1 through _20).",
      );
    }
    out[`merchant_defined_field_${n}`] = value;
  }
  return out;
}

export interface FrequencyShape {
  dayFrequency?: number | undefined;
  monthFrequency?: number | undefined;
  dayOfMonth?: number | undefined;
}

/**
 * Recurring frequency: `dayFrequency` XOR (`monthFrequency` AND `dayOfMonth`).
 * The gateway rejects any other combination.
 */
export function validateFrequency(
  shape: FrequencyShape,
  { required = true }: { required?: boolean } = {},
): void {
  const hasDay = shape.dayFrequency !== undefined;
  const hasMonth = shape.monthFrequency !== undefined;
  const hasDom = shape.dayOfMonth !== undefined;
  if (hasDay && (hasMonth || hasDom)) {
    throw new ValidationError(
      "Invalid plan frequency: provide either dayFrequency OR (monthFrequency AND dayOfMonth), not both.",
    );
  }
  if (!hasDay && (hasMonth !== hasDom)) {
    throw new ValidationError(
      "Invalid plan frequency: monthFrequency and dayOfMonth must be provided together.",
    );
  }
  if (!hasDay && !hasMonth && required) {
    throw new ValidationError(
      "Missing plan frequency: provide either dayFrequency OR (monthFrequency AND dayOfMonth).",
    );
  }
  if (hasDay && (!Number.isInteger(shape.dayFrequency) || (shape.dayFrequency as number) < 1)) {
    throw new ValidationError("Invalid dayFrequency: expected a positive integer number of days.");
  }
  if (
    hasMonth &&
    (!Number.isInteger(shape.monthFrequency) ||
      (shape.monthFrequency as number) < 1 ||
      (shape.monthFrequency as number) > 24)
  ) {
    throw new ValidationError("Invalid monthFrequency: expected an integer from 1 to 24.");
  }
  if (
    hasDom &&
    (!Number.isInteger(shape.dayOfMonth) ||
      (shape.dayOfMonth as number) < 1 ||
      (shape.dayOfMonth as number) > 31)
  ) {
    throw new ValidationError("Invalid dayOfMonth: expected an integer from 1 to 31.");
  }
}

/** Validate a non-negative integer count (plan payments; 0 = until canceled). */
export function validatePayments(value: unknown, field: string): string {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new ValidationError(
      `Invalid ${field}: expected a non-negative integer (0 means "until canceled").`,
    );
  }
  return String(value);
}
