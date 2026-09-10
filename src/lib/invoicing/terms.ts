/**
 * Payment terms and invoice totalling. Pure arithmetic — no database, no framework —
 * for the same reason src/lib/invoicing/calc.ts is: an invoice total that is wrong is
 * a bill that is wrong, and that has to be testable without standing anything up.
 */

import type { PaymentTerms } from "@/generated/prisma/enums";
import { roundHalfAwayFromZero, type BasisPoints, type Cents } from "@/lib/money";

const NET_DAYS: Readonly<Record<PaymentTerms, number | null>> = {
  DUE_ON_RECEIPT: 0,
  NET_15: 15,
  NET_30: 30,
  NET_45: 45,
  NET_60: 60,
  // CUSTOM means a human set the date; nothing should recompute it.
  CUSTOM: null,
};

export const PAYMENT_TERMS_LABELS: Readonly<Record<PaymentTerms, string>> = {
  DUE_ON_RECEIPT: "Due on receipt",
  NET_15: "Net 15",
  NET_30: "Net 30",
  NET_45: "Net 45",
  NET_60: "Net 60",
  CUSTOM: "Custom date",
};

/**
 * The due date these terms imply, or null on CUSTOM. Day arithmetic is done in UTC
 * so a Net 30 invoice issued late in the evening lands on day 30, not day 29 or 31
 * depending on where the server happens to be.
 */
export function dueDateFor(terms: PaymentTerms, issuedOn: Date): Date | null {
  const days = NET_DAYS[terms];
  if (days === null) return null;
  const due = new Date(issuedOn);
  due.setUTCDate(due.getUTCDate() + days);
  return due;
}

/** Past due, and by how much. An invoice with no due date is never overdue. */
export function daysOverdue(dueOn: Date | null, asOf: Date): number {
  if (!dueOn) return 0;
  const days = Math.floor((asOf.getTime() - dueOn.getTime()) / 86_400_000);
  return days > 0 ? days : 0;
}

export interface InvoiceLineForTotals {
  readonly amountCents: Cents;
  readonly taxable: boolean;
}

export interface InvoiceTotals {
  readonly subtotalCents: Cents;
  readonly taxableCents: Cents;
  readonly taxCents: Cents;
  readonly totalCents: Cents;
}

/**
 * Total an invoice from its lines.
 *
 * Tax is charged on the taxable subtotal as a whole rather than per line and then
 * summed: rounding each line separately drifts by a cent per line against what the
 * client's own arithmetic will produce from the printed subtotal.
 */
export function computeInvoiceTotals(
  lines: readonly InvoiceLineForTotals[],
  taxRateBasisPoints: BasisPoints,
): InvoiceTotals {
  const subtotalCents = lines.reduce((total, line) => total + line.amountCents, 0);
  const taxableCents = lines.reduce((total, line) => (line.taxable ? total + line.amountCents : total), 0);
  const taxCents = roundHalfAwayFromZero((taxableCents * taxRateBasisPoints) / 10_000);
  return { subtotalCents, taxableCents, taxCents, totalCents: subtotalCents + taxCents };
}
