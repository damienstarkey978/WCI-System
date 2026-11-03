/**
 * Illustrative monthly payment strip for client proposals (Handoff "from $X/month").
 * Not a lender quote — equal-payment amortization over a conventional term so the
 * UI can match Handoff without inventing a financing partner.
 *
 * CR P3 #27 — toggle off when the lead says financing isn't needed.
 */

import { formatMoney } from "@/lib/format";

/** Conventional illustrative term used for the "from $X/mo" callout. */
export const ILLUSTRATIVE_FINANCING_MONTHS = 60;

const FINANCING_DECLINED_RE =
  /\b(no\s+financ(e|ing)|financ(e|ing)\s+(is\s+)?(not|isn't|isnt)\s+(needed|required|wanted)|cash\s+only|paying\s+cash|won't\s+finance|will\s+not\s+finance)\b/i;

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

/** True when lead/notes language declines financing. */
export function leadDeclinesFinancing(text?: string | null): boolean {
  if (!text?.trim()) return false;
  return FINANCING_DECLINED_RE.test(text);
}

/**
 * Resolve whether the proposal should show the illustrative monthly strip.
 * Explicit proposal flag wins; otherwise infer from lead notes.
 */
export function resolveShowFinancing(params: {
  readonly showFinancing?: boolean | null;
  readonly leadNotes?: string | null;
}): boolean {
  if (params.showFinancing === false) return false;
  if (params.showFinancing === true) {
    // Still respect an explicit true even if notes decline — caller set it on purpose.
    return true;
  }
  return !leadDeclinesFinancing(params.leadNotes);
}
