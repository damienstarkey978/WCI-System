/**
 * Proposal tax line (Handoff parity CR P2 #17).
 * Org default is 0% — show "Tax 0% $0.00" on the proposal.
 */

import { roundHalfAwayFromZero, type BasisPoints, type Cents } from "@/lib/money";

export const DEFAULT_ORG_TAX_RATE_BASIS_POINTS = 0 as BasisPoints;

export function computeProposalTaxCents(subtotalCents: Cents, taxRateBasisPoints: BasisPoints): Cents {
  if (taxRateBasisPoints <= 0 || subtotalCents <= 0) return 0;
  return roundHalfAwayFromZero((subtotalCents * taxRateBasisPoints) / 10_000);
}

/** Handoff-style label, e.g. "Tax 0% $0.00". */
export function formatProposalTaxLine(params: {
  readonly taxRateBasisPoints: BasisPoints;
  readonly taxCents: Cents;
  readonly formatMoney: (cents: Cents) => string;
}): string {
  const pct = (params.taxRateBasisPoints / 100).toFixed(0);
  return `Tax ${pct}% ${params.formatMoney(params.taxCents)}`;
}
