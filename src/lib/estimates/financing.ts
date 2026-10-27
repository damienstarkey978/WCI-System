/**
 * Illustrative monthly payment strip for client proposals (Handoff "from $X/month").
 * Not a lender quote — equal-payment amortization over a conventional term so the
 * UI can match Handoff without inventing a financing partner.
 */

import { formatMoney } from "@/lib/format";

/** Conventional illustrative term used for the "from $X/mo" callout. */
export const ILLUSTRATIVE_FINANCING_MONTHS = 60;

export function illustrativeMonthlyPaymentCents(
  totalCents: number,
  months: number = ILLUSTRATIVE_FINANCING_MONTHS,
): number {
  if (totalCents <= 0 || months <= 0) return 0;
  return Math.ceil(totalCents / months);
}

export function formatIllustrativeMonthly(totalCents: number): string | null {
  const monthly = illustrativeMonthlyPaymentCents(totalCents);
  if (monthly <= 0) return null;
  return formatMoney(monthly);
}
