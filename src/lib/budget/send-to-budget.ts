/**
 * "Send to Job Budget" — the Estimate → Budget conversion.
 *
 * This is the canonical example of the explicit-conversion pattern (CLAUDE.md 2.3):
 * an operator action materializes linked records, rather than the budget silently
 * tracking the estimate in the background. The estimate is locked at the same moment,
 * so the budget always corresponds to a fixed, auditable version of the estimate.
 */

import type { RateMode } from "@/generated/prisma/enums";
import { EstimateStatus } from "@/generated/prisma/enums";
import { extendedCostCents, priceWithRate } from "@/lib/budget/funnel";
import { db } from "@/lib/db";
import { BASIS_POINTS_SCALE, roundHalfAwayFromZero, type BasisPoints, type Cents } from "@/lib/money";

export class EstimateNotFoundError extends Error {
  constructor(estimateId: string) {
    super(`Estimate ${estimateId} not found`);
    this.name = "EstimateNotFoundError";
  }
}

export class EstimateAlreadyLockedError extends Error {
  constructor(estimateId: string) {
    super(`Estimate ${estimateId} has already been sent to the budget. Revise it to send an updated version.`);
    this.name = "EstimateAlreadyLockedError";
  }
}

export class EmptyEstimateError extends Error {
  constructor(estimateId: string) {
    super(`Estimate ${estimateId} has no line items, so there is nothing to budget.`);
    this.name = "EmptyEstimateError";
  }
}

/** There's no Budget to send to before a real Job exists — an estimate drafted
 *  straight off a Lead (jobId null until its proposal is accepted, see
 *  src/lib/crm/lead-proposal.ts) can't reach this function through any normal
 *  path (acceptProposal() backfills jobId before ever calling this), so this
 *  is a defensive invariant check, not an expected user-facing error. */
export class EstimateHasNoJobError extends Error {
  constructor(estimateId: string) {
    super(`Estimate ${estimateId} has no Job yet — nothing to send to budget.`);
    this.name = "EstimateHasNoJobError";
  }
}

export interface EstimateLineForRollup {
  readonly costCodeId: string;
  readonly quantityMilli: number;
  readonly unitCostCents: Cents;
  readonly rateMode: RateMode;
  readonly rateBasisPoints: BasisPoints;
}

export interface CostCodeRollup {
  readonly costCodeId: string;
  readonly costCents: Cents;
  readonly clientPriceCents: Cents;
  /**
   * The blended rate that reproduces this cost code's price from its cost, in basis
   * points of markup. Lines under one cost code can carry different rates, so the
   * budget stores the effective blend rather than pretending one line's rate applies
   * to all of them.
   */
  readonly blendedMarkupBasisPoints: BasisPoints;
}

/**
 * Aggregate estimate lines into one row per cost code.
 *
 * Pricing is computed **per line, then summed** — never by pricing the summed cost.
 * Lines under the same cost code can carry different markups, and pricing the total
 * would quietly discard that.
 */
export function rollUpEstimateLines(lines: readonly EstimateLineForRollup[]): readonly CostCodeRollup[] {
  const byCostCode = new Map<string, { costCents: Cents; clientPriceCents: Cents }>();

  for (const line of lines) {
    const lineCost = extendedCostCents(line.quantityMilli, line.unitCostCents);
    const linePrice = priceWithRate(lineCost, line.rateMode, line.rateBasisPoints);

    const existing = byCostCode.get(line.costCodeId) ?? { costCents: 0, clientPriceCents: 0 };
    byCostCode.set(line.costCodeId, {
      costCents: existing.costCents + lineCost,
      clientPriceCents: existing.clientPriceCents + linePrice,
    });
  }

  return Array.from(byCostCode.entries()).map(([costCodeId, totals]) => ({
    costCodeId,
    costCents: totals.costCents,
    clientPriceCents: totals.clientPriceCents,
    blendedMarkupBasisPoints: blendedMarkup(totals.costCents, totals.clientPriceCents),
  }));
}

/** The markup rate that turns `costCents` into `priceCents`, in basis points. */
export function blendedMarkup(costCents: Cents, priceCents: Cents): BasisPoints {
  if (costCents === 0) return 0;
  return roundHalfAwayFromZero((priceCents / costCents - 1) * BASIS_POINTS_SCALE);
}

export interface SendToBudgetResult {
  readonly estimateId: string;
  readonly jobId: string;
  readonly budgetLinesWritten: number;
  readonly totalCostCents: Cents;
  readonly totalClientPriceCents: Cents;
}

export interface SendToBudgetInput {
  readonly estimateId: string;
  readonly organizationId: string;
  /** Re-sending a revised estimate updates the revised figures but never the original. */
  readonly allowResend?: boolean;
}

/**
 * Lock an estimate and write its totals into the job's budget.
 *
 * `originalBudgetCost` is written only the first time a cost code is budgeted — it is
 * the baseline the whole funnel measures variance against, so a later revision must
 * not overwrite it. Subsequent sends update the revised figures only.
 */
export async function sendEstimateToBudget(input: SendToBudgetInput): Promise<SendToBudgetResult> {
  const { estimateId, organizationId, allowResend = false } = input;

  return db.$transaction(async (tx) => {
    const estimate = await tx.estimate.findFirst({
      where: { id: estimateId, organizationId },
      include: { lineItems: true },
    });

    if (!estimate) {
      throw new EstimateNotFoundError(estimateId);
    }
    if (estimate.jobId === null) {
      throw new EstimateHasNoJobError(estimateId);
    }
    const jobId = estimate.jobId;
    if (estimate.sentToBudgetAt !== null && !allowResend) {
      throw new EstimateAlreadyLockedError(estimateId);
    }
    if (estimate.lineItems.length === 0) {
      throw new EmptyEstimateError(estimateId);
    }

    const rollups = rollUpEstimateLines(estimate.lineItems);

    for (const rollup of rollups) {
      const existing = await tx.budgetLine.findUnique({
        where: { jobId_costCodeId: { jobId, costCodeId: rollup.costCodeId } },
      });

      if (existing) {
        await tx.budgetLine.update({
          where: { id: existing.id },
          data: {
            revisedBudgetCostCents: rollup.costCents,
            revisedClientPriceCents: rollup.clientPriceCents,
            rateMode: estimate.rateMode,
            rateBasisPoints: rollup.blendedMarkupBasisPoints,
          },
        });
      } else {
        await tx.budgetLine.create({
          data: {
            jobId,
            costCodeId: rollup.costCodeId,
            originalBudgetCostCents: rollup.costCents,
            revisedBudgetCostCents: rollup.costCents,
            originalClientPriceCents: rollup.clientPriceCents,
            revisedClientPriceCents: rollup.clientPriceCents,
            rateMode: estimate.rateMode,
            rateBasisPoints: rollup.blendedMarkupBasisPoints,
          },
        });
      }
    }

    await tx.estimate.update({
      where: { id: estimate.id },
      data: {
        status: EstimateStatus.LOCKED,
        lockedAt: estimate.lockedAt ?? new Date(),
        sentToBudgetAt: new Date(),
      },
    });

    return {
      estimateId: estimate.id,
      jobId,
      budgetLinesWritten: rollups.length,
      totalCostCents: rollups.reduce((total, rollup) => total + rollup.costCents, 0),
      totalClientPriceCents: rollups.reduce((total, rollup) => total + rollup.clientPriceCents, 0),
    };
  });
}
