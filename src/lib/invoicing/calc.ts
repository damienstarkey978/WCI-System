/**
 * Pure invoicing arithmetic — no database, no framework. Kept separate from
 * src/lib/invoicing/service.ts the same way src/lib/budget/funnel.ts is kept
 * separate from src/lib/budget/service.ts, so the money math is unit-testable
 * without a database.
 */

import { roundHalfAwayFromZero, type BasisPoints, type Cents } from "@/lib/money";

/** The dollar amount a draw represents, from the job's current contract price. */
export function computeDrawAmountCents(contractPriceCents: Cents, pctOfContractBasisPoints: BasisPoints): Cents {
  return roundHalfAwayFromZero((contractPriceCents * pctOfContractBasisPoints) / 10_000);
}

export type InvoiceStatus = "DRAFT" | "SENT" | "PARTIALLY_PAID" | "PAID" | "VOID";

export class OverpaymentError extends Error {
  constructor(amountCents: Cents, remainingCents: Cents) {
    super(
      `Payment of ${amountCents} cents exceeds the ${remainingCents} cents remaining on this invoice. ` +
        "Record a partial payment for the correct amount, or issue a credit memo instead.",
    );
    this.name = "OverpaymentError";
  }
}

export interface ApplyPaymentResult {
  readonly totalPaidCents: Cents;
  readonly remainingCents: Cents;
  readonly status: InvoiceStatus;
}

/**
 * Apply a new payment to an invoice's existing paid total and decide its resulting
 * status. Throws rather than silently accepting an overpayment, because a
 * fat-fingered amount here would corrupt `amountInvoiced`/`remainingToInvoice` in
 * the funnel (CLAUDE.md 2.3) for the rest of the job's life.
 */
export function applyPayment(
  invoiceAmountCents: Cents,
  previouslyPaidCents: Cents,
  newPaymentCents: Cents,
): ApplyPaymentResult {
  if (newPaymentCents <= 0) {
    throw new Error("A payment must be a positive amount.");
  }

  const remainingBeforeThisPayment = invoiceAmountCents - previouslyPaidCents;
  if (newPaymentCents > remainingBeforeThisPayment) {
    throw new OverpaymentError(newPaymentCents, remainingBeforeThisPayment);
  }

  const totalPaidCents = previouslyPaidCents + newPaymentCents;
  const remainingCents = invoiceAmountCents - totalPaidCents;

  return {
    totalPaidCents,
    remainingCents,
    status: remainingCents === 0 ? "PAID" : "PARTIALLY_PAID",
  };
}

/** The sum of a draw schedule's percentages, so a caller can warn or reject over/under-allocation. */
export function totalDrawPercentage(drawPercentagesBasisPoints: readonly BasisPoints[]): BasisPoints {
  return drawPercentagesBasisPoints.reduce((total, pct) => total + pct, 0);
}
