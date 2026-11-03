/**
 * Handoff-style estimate Breakdown panel math (Material / Labor / Other).
 * Money stays integer cents; rates stay basis points.
 */

import { marginBasisPoints, type BasisPoints, type Cents } from "@/lib/money";
import { priceWithRate } from "@/lib/budget/funnel";
import type { RateMode } from "@/generated/prisma/enums";

export type BreakdownBucket = "MATERIAL" | "LABOR" | "OTHER";

export interface BreakdownLineInput {
  readonly costType: string;
  readonly builderCostCents: Cents;
  readonly clientTotalCents: Cents;
  readonly rateBasisPoints: BasisPoints;
}

export interface BreakdownBucketTotals {
  readonly costCents: Cents;
  readonly markupCents: Cents;
  readonly clientCents: Cents;
  /** Weighted display rate for the bucket (0 when no cost). */
  readonly markupBasisPoints: BasisPoints;
}

export interface EstimateBreakdown {
  readonly totalCostCents: Cents;
  readonly totalMarkupCents: Cents;
  readonly subtotalCents: Cents;
  readonly estimateTotalCents: Cents;
  readonly profitMarginBasisPoints: BasisPoints;
  readonly material: BreakdownBucketTotals;
  readonly labor: BreakdownBucketTotals;
  readonly other: BreakdownBucketTotals;
}

export function costTypeToBreakdownBucket(costType: string): BreakdownBucket {
  if (costType === "MATERIAL") return "MATERIAL";
  if (costType === "LABOR") return "LABOR";
  return "OTHER";
}

function emptyBucket(): BreakdownBucketTotals {
  return { costCents: 0, markupCents: 0, clientCents: 0, markupBasisPoints: 0 };
}

function finalizeBucket(costCents: Cents, clientCents: Cents): BreakdownBucketTotals {
  const markupCents = clientCents - costCents;
  const markupBasisPoints =
    costCents > 0 ? Math.round((markupCents / costCents) * 10_000) : 0;
  return { costCents, markupCents, clientCents, markupBasisPoints };
}

export function computeEstimateBreakdown(lines: readonly BreakdownLineInput[]): EstimateBreakdown {
  let materialCost = 0;
  let materialClient = 0;
  let laborCost = 0;
  let laborClient = 0;
  let otherCost = 0;
  let otherClient = 0;

  for (const line of lines) {
    const bucket = costTypeToBreakdownBucket(line.costType);
    if (bucket === "MATERIAL") {
      materialCost += line.builderCostCents;
      materialClient += line.clientTotalCents;
    } else if (bucket === "LABOR") {
      laborCost += line.builderCostCents;
      laborClient += line.clientTotalCents;
    } else {
      otherCost += line.builderCostCents;
      otherClient += line.clientTotalCents;
    }
  }

  const material = materialCost || materialClient ? finalizeBucket(materialCost, materialClient) : emptyBucket();
  const labor = laborCost || laborClient ? finalizeBucket(laborCost, laborClient) : emptyBucket();
  const other = otherCost || otherClient ? finalizeBucket(otherCost, otherClient) : emptyBucket();

  const totalCostCents = material.costCents + labor.costCents + other.costCents;
  const estimateTotalCents = material.clientCents + labor.clientCents + other.clientCents;
  const totalMarkupCents = estimateTotalCents - totalCostCents;

  return {
    totalCostCents,
    totalMarkupCents,
    subtotalCents: estimateTotalCents,
    estimateTotalCents,
    profitMarginBasisPoints: marginBasisPoints(estimateTotalCents, totalCostCents),
    material,
    labor,
    other,
  };
}

/** Build breakdown inputs from spreadsheet-shaped lines. */
export function breakdownLinesFromSpreadsheetItems(
  items: readonly {
    costType: string;
    builderCostCents: number;
    clientTotalCents: number;
    rateBasisPoints: number;
  }[],
): BreakdownLineInput[] {
  return items.map((item) => ({
    costType: item.costType,
    builderCostCents: item.builderCostCents,
    clientTotalCents: item.clientTotalCents,
    rateBasisPoints: item.rateBasisPoints,
  }));
}

export function lineClientTotalCents(params: {
  readonly quantityMilli: number;
  readonly unitCostCents: number;
  readonly rateMode: RateMode | string;
  readonly rateBasisPoints: number;
}): Cents {
  const cost = Math.round((params.quantityMilli * params.unitCostCents) / 1_000);
  return priceWithRate(cost, params.rateMode as RateMode, params.rateBasisPoints);
}
