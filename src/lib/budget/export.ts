/**
 * CSV export of the Job Costing Budget grid, in the same column set and grouping the
 * screen shows. Pure so it is unit-testable; the route handler only loads the budget
 * and streams this string back.
 */

import type { FunnelLine, FunnelSubtotal, FunnelTotals } from "@/lib/budget/funnel";
import type { BudgetGroup } from "@/lib/budget/grouping";
import type { BudgetColumnId } from "@/lib/contract-type";

export const BUDGET_COLUMN_LABELS: Record<BudgetColumnId, string> = {
  originalBudgetCost: "Original budget",
  revisedBudgetCost: "Revised budget",
  pendingCost: "Pending cost",
  committedCost: "Committed cost",
  actualCost: "Actual cost",
  projectedCost: "Projected cost",
  costToComplete: "Cost to complete",
  originalClientPrice: "Original price",
  revisedClientPrice: "Revised price",
  amountInvoiced: "Amount invoiced",
  remainingToInvoice: "Remaining to invoice",
  projectedProfit: "Projected profit",
  projectedMarginPct: "Margin",
};

export function csvEscape(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

const dollars = (cents: number) => (cents / 100).toFixed(2);
const percent = (basisPoints: number) => (basisPoints / 100).toFixed(1);

type Measured = Pick<
  FunnelSubtotal,
  | "originalBudgetCostCents"
  | "revisedBudgetCostCents"
  | "pendingCostCents"
  | "committedCostCents"
  | "actualCostCents"
  | "projectedCostCents"
  | "costToCompleteCents"
  | "originalClientPriceCents"
  | "revisedClientPriceCents"
  | "projectedProfitCents"
  | "projectedMarginBasisPoints"
>;

function measuredValue(source: Measured, columnId: BudgetColumnId): string {
  switch (columnId) {
    case "originalBudgetCost":
      return dollars(source.originalBudgetCostCents);
    case "revisedBudgetCost":
      return dollars(source.revisedBudgetCostCents);
    case "pendingCost":
      return dollars(source.pendingCostCents);
    case "committedCost":
      return dollars(source.committedCostCents);
    case "actualCost":
      return dollars(source.actualCostCents);
    case "projectedCost":
      return dollars(source.projectedCostCents);
    case "costToComplete":
      return dollars(source.costToCompleteCents);
    case "originalClientPrice":
      return dollars(source.originalClientPriceCents);
    case "revisedClientPrice":
      return dollars(source.revisedClientPriceCents);
    case "projectedProfit":
      return dollars(source.projectedProfitCents);
    case "projectedMarginPct":
      return percent(source.projectedMarginBasisPoints);
    // Invoicing is tracked per job, not per cost code, so line and group rows leave it blank (same as the screen).
    case "amountInvoiced":
    case "remainingToInvoice":
      return "";
  }
}

export function budgetToCsv(input: { groups: readonly BudgetGroup[]; totals: FunnelTotals; columns: readonly BudgetColumnId[] }): string {
  const lines: string[] = [];
  const row = (cells: readonly string[]) => lines.push(cells.map(csvEscape).join(","));

  row(["Cost code", "Description", "Row type", ...input.columns.map((id) => BUDGET_COLUMN_LABELS[id])]);

  for (const group of input.groups) {
    for (const entry of group.lines) {
      row([entry.code, entry.name, "Line", ...input.columns.map((id) => measuredValue(entry.line as FunnelLine, id))]);
    }
    row([group.code, group.name, "Group subtotal", ...input.columns.map((id) => measuredValue(group.subtotal, id))]);
  }

  row([
    "",
    "Total",
    "Total",
    ...input.columns.map((id) =>
      id === "amountInvoiced" ? dollars(input.totals.amountInvoicedCents) : id === "remainingToInvoice" ? dollars(input.totals.remainingToInvoiceCents) : measuredValue(input.totals, id),
    ),
  ]);

  return `${lines.join("\r\n")}\r\n`;
}
