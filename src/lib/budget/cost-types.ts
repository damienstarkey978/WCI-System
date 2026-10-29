/**
 * Cost-type rollups for the Job Costing Budget screen.
 *
 * WCI's catalog already splits most trades into separate Labor / Materials cost
 * codes (CLAUDE.md 6), and Estimate/PO/Bill line items carry their own
 * `CostType`. The funnel itself stays Job × CostCode — this module only
 * annotates and aggregates those lines so the screen can show materials vs
 * labor totals and an on-budget signal without inventing a parallel model.
 */

import type { CostType } from "@/generated/prisma/enums";
import type { FunnelLine } from "@/lib/budget/funnel";
import type { CostCodeLookupEntry } from "@/lib/budget/grouping";
import type { Cents } from "@/lib/money";

/** The cost types the Job Costing Budget summary strip calls out. */
export const BUDGET_COST_TYPE_ORDER = [
  "LABOR",
  "MATERIAL",
  "SUBCONTRACTOR",
  "EQUIPMENT",
  "OTHER",
  "NONE",
] as const satisfies readonly CostType[];

export type BudgetCostType = (typeof BUDGET_COST_TYPE_ORDER)[number];

export const COST_TYPE_LABELS: Record<BudgetCostType, string> = {
  LABOR: "Labor",
  MATERIAL: "Materials",
  SUBCONTRACTOR: "Subcontractor",
  EQUIPMENT: "Equipment",
  OTHER: "Other",
  NONE: "Unspecified",
};

export interface CostTypeTotals {
  readonly costType: BudgetCostType;
  readonly label: string;
  readonly revisedBudgetCostCents: Cents;
  readonly actualCostCents: Cents;
  readonly committedCostCents: Cents;
  readonly pendingCostCents: Cents;
  readonly lineCount: number;
  /** True when actual has already passed the revised budget for this type. */
  readonly isOverBudget: boolean;
  /** Revised budget − actual. Positive = under; negative = over. */
  readonly spendVarianceCents: Cents;
}

/**
 * Resolve the cost type to display for a funnel line. Prefers the cost code's
 * catalog default (how WCI names Labor vs Materials leaves); falls back to NONE
 * when the code has no type, so the strip never drops money.
 */
export function costTypeForLine(
  line: FunnelLine,
  costCodes: Readonly<Record<string, CostCodeLookupEntry>>,
): BudgetCostType {
  const raw = costCodes[line.costCodeId]?.defaultCostType ?? "NONE";
  return (BUDGET_COST_TYPE_ORDER.includes(raw as BudgetCostType) ? raw : "NONE") as BudgetCostType;
}

/**
 * How much of the revised budget is left after actual spend. Same arithmetic the
 * grid's Variance column shows — kept here so the summary strip and the table
 * can't disagree.
 */
export function spendVarianceCents(line: Pick<FunnelLine, "revisedBudgetCostCents" | "actualCostCents">): Cents {
  return line.revisedBudgetCostCents - line.actualCostCents;
}

/** Percent of revised budget already spent, rounded to a whole percent. Null when no budget. */
export function spendPercent(line: Pick<FunnelLine, "revisedBudgetCostCents" | "actualCostCents">): number | null {
  if (line.revisedBudgetCostCents <= 0) return null;
  return Math.round((line.actualCostCents / line.revisedBudgetCostCents) * 100);
}

/**
 * Roll funnel lines up by cost type. Empty types are omitted so the strip only
 * shows Labor / Materials / … that actually have money on this job.
 */
export function rollUpByCostType(
  lines: readonly FunnelLine[],
  costCodes: Readonly<Record<string, CostCodeLookupEntry>>,
): readonly CostTypeTotals[] {
  const buckets = new Map<BudgetCostType, CostTypeTotals>();

  for (const line of lines) {
    const costType = costTypeForLine(line, costCodes);
    const existing = buckets.get(costType);
    const revisedBudgetCostCents = (existing?.revisedBudgetCostCents ?? 0) + line.revisedBudgetCostCents;
    const actualCostCents = (existing?.actualCostCents ?? 0) + line.actualCostCents;
    const committedCostCents = (existing?.committedCostCents ?? 0) + line.committedCostCents;
    const pendingCostCents = (existing?.pendingCostCents ?? 0) + line.pendingCostCents;
    buckets.set(costType, {
      costType,
      label: COST_TYPE_LABELS[costType],
      revisedBudgetCostCents,
      actualCostCents,
      committedCostCents,
      pendingCostCents,
      lineCount: (existing?.lineCount ?? 0) + 1,
      isOverBudget: actualCostCents > revisedBudgetCostCents && revisedBudgetCostCents > 0,
      spendVarianceCents: revisedBudgetCostCents - actualCostCents,
    });
  }

  return BUDGET_COST_TYPE_ORDER.map((costType) => buckets.get(costType)).filter(
    (entry): entry is CostTypeTotals => entry !== undefined,
  );
}
