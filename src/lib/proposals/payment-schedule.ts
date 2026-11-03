/**
 * Proposal payment schedule rules (Handoff parity CR P1 #7).
 * Deposit ≤ 20% (reject 25%); second draw “due upon commencement of work”;
 * draws must total 100% before send.
 */

import type { BasisPoints } from "@/lib/money";

export const MAX_DEPOSIT_BASIS_POINTS = 2_000; // 20%
export const FULL_SCHEDULE_BASIS_POINTS = 10_000; // 100%

export const COMMENCEMENT_DRAW_TITLE = "Due upon commencement of work";

/** Canonical WCI offer schedule from proposal terms (15/20/20/20/15/10). */
export const DEFAULT_PROPOSAL_PAYMENT_SCHEDULE: readonly {
  readonly title: string;
  readonly pctOfContractBasisPoints: BasisPoints;
}[] = [
  { title: "Deposit due upon execution of this agreement", pctOfContractBasisPoints: 1_500 },
  { title: COMMENCEMENT_DRAW_TITLE, pctOfContractBasisPoints: 2_000 },
  {
    title:
      "Due upon completion of demo, concrete/foundation, framing, roof and wall sheathing, plumbing drain rough-in",
    pctOfContractBasisPoints: 2_000,
  },
  {
    title: "Due upon completion of electrical rough-in, roof, soffit, window, door, siding",
    pctOfContractBasisPoints: 2_000,
  },
  { title: "Due upon completion of pavers and bathroom", pctOfContractBasisPoints: 1_500 },
  { title: "Due upon completion of remaining line items", pctOfContractBasisPoints: 1_000 },
];

export class DepositTooHighError extends Error {
  constructor(public readonly pctBasisPoints: number) {
    super(
      `Deposit of ${(pctBasisPoints / 100).toFixed(0)}% exceeds the 20% maximum (25% deposits are rejected).`,
    );
    this.name = "DepositTooHighError";
  }
}

export class PaymentScheduleIncompleteError extends Error {
  constructor(public readonly reasons: readonly string[]) {
    super(`Payment schedule is incomplete: ${reasons.join("; ")}`);
    this.name = "PaymentScheduleIncompleteError";
  }
}

export interface ScheduleDraw {
  readonly title: string;
  readonly pctOfContractBasisPoints: number;
  readonly sortOrder?: number;
}

function sortedDraws(draws: readonly ScheduleDraw[]): ScheduleDraw[] {
  return [...draws].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
}

/** First draw is the deposit. Reject anything above 20% (including 25%). */
export function assertDepositWithinLimit(draws: readonly ScheduleDraw[]): void {
  const ordered = sortedDraws(draws);
  if (ordered.length === 0) return;
  const deposit = ordered[0]!;
  if (deposit.pctOfContractBasisPoints > MAX_DEPOSIT_BASIS_POINTS) {
    throw new DepositTooHighError(deposit.pctOfContractBasisPoints);
  }
}

export function findPaymentScheduleIssues(draws: readonly ScheduleDraw[]): string[] {
  const ordered = sortedDraws(draws);
  const issues: string[] = [];
  if (ordered.length === 0) {
    issues.push("Add a payment schedule (deposit + draws totaling 100%).");
    return issues;
  }

  const total = ordered.reduce((sum, draw) => sum + draw.pctOfContractBasisPoints, 0);
  if (total !== FULL_SCHEDULE_BASIS_POINTS) {
    issues.push(`Draws total ${(total / 100).toFixed(2)}% — must equal 100%.`);
  }

  try {
    assertDepositWithinLimit(ordered);
  } catch (error) {
    if (error instanceof DepositTooHighError) issues.push(error.message);
    else throw error;
  }

  if (ordered.length >= 2) {
    const second = ordered[1]!;
    if (!/commencement\s+of\s+work/i.test(second.title)) {
      issues.push(`Second draw must be titled like "${COMMENCEMENT_DRAW_TITLE}".`);
    }
  } else {
    issues.push(`Schedule needs a second draw: "${COMMENCEMENT_DRAW_TITLE}".`);
  }

  return issues;
}

export function assertPaymentScheduleReady(draws: readonly ScheduleDraw[]): void {
  const issues = findPaymentScheduleIssues(draws);
  if (issues.length > 0) throw new PaymentScheduleIncompleteError(issues);
}
