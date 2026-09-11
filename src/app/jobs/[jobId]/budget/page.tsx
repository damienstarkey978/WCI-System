import Link from "next/link";
import { notFound } from "next/navigation";

import { SetupNotice } from "@/app/admin/setup-notice";
import { currentAppUser } from "@/lib/auth";
import { getJobBudget, JobNotFoundError } from "@/lib/budget/service";
import type { FunnelLine, FunnelSubtotal, FunnelTotals } from "@/lib/budget/funnel";
import { groupFunnelLines } from "@/lib/budget/grouping";
import { BUDGET_VIEWS, budgetViewByKey, type BudgetColumnId } from "@/lib/contract-type";
import { formatMoney, formatPercent } from "@/lib/format";

import { BudgetGrid, type GridCell } from "./budget-grid";

export const dynamic = "force-dynamic";

const COLUMN_LABELS: Record<BudgetColumnId, string> = {
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

function lineCell(line: FunnelLine, columnId: BudgetColumnId): GridCell {
  // An unbudgeted line is "over budget" against a budget of zero, which is true but
  // useless — it would paint every such row red. The "No budget" badge says the real
  // thing, so the overrun styling is kept for lines that actually had a budget to beat.
  const danger = line.isOverBudget && !line.isUnbudgeted && columnId === "projectedCost";
  switch (columnId) {
    case "originalBudgetCost":
      return { text: formatMoney(line.originalBudgetCostCents) };
    case "revisedBudgetCost":
      return { text: formatMoney(line.revisedBudgetCostCents) };
    case "pendingCost":
      return { text: formatMoney(line.pendingCostCents) };
    case "committedCost":
      return { text: formatMoney(line.committedCostCents) };
    case "actualCost":
      return { text: formatMoney(line.actualCostCents) };
    case "projectedCost":
      return { text: formatMoney(line.projectedCostCents), danger };
    case "costToComplete":
      return { text: formatMoney(line.costToCompleteCents) };
    case "originalClientPrice":
      return { text: formatMoney(line.originalClientPriceCents) };
    case "revisedClientPrice":
      return { text: formatMoney(line.revisedClientPriceCents) };
    case "projectedProfit":
      return { text: formatMoney(line.projectedProfitCents) };
    case "projectedMarginPct":
      return { text: formatPercent(line.projectedMarginBasisPoints) };
    // Invoicing is tracked at the job level only — a single progress invoice bills
    // against the whole contract, not a specific cost code (CLAUDE.md 2.3).
    case "amountInvoiced":
    case "remainingToInvoice":
      return { text: "—" };
  }
}

/**
 * A group subtotal. Same columns as a line, and the same reason invoicing is blank:
 * an invoice belongs to the contract, not to "05 Painting".
 */
function subtotalCell(subtotal: FunnelSubtotal, columnId: BudgetColumnId): GridCell {
  switch (columnId) {
    case "originalBudgetCost":
      return { text: formatMoney(subtotal.originalBudgetCostCents) };
    case "revisedBudgetCost":
      return { text: formatMoney(subtotal.revisedBudgetCostCents) };
    case "pendingCost":
      return { text: formatMoney(subtotal.pendingCostCents) };
    case "committedCost":
      return { text: formatMoney(subtotal.committedCostCents) };
    case "actualCost":
      return { text: formatMoney(subtotal.actualCostCents) };
    case "projectedCost":
      return {
        text: formatMoney(subtotal.projectedCostCents),
        danger: subtotal.projectedCostCents > subtotal.revisedBudgetCostCents,
      };
    case "costToComplete":
      return { text: formatMoney(subtotal.costToCompleteCents) };
    case "originalClientPrice":
      return { text: formatMoney(subtotal.originalClientPriceCents) };
    case "revisedClientPrice":
      return { text: formatMoney(subtotal.revisedClientPriceCents) };
    case "projectedProfit":
      return { text: formatMoney(subtotal.projectedProfitCents) };
    case "projectedMarginPct":
      return { text: formatPercent(subtotal.projectedMarginBasisPoints) };
    case "amountInvoiced":
    case "remainingToInvoice":
      return { text: "—" };
  }
}

function totalsCell(totals: FunnelTotals, columnId: BudgetColumnId): GridCell {
  if (columnId === "amountInvoiced") return { text: formatMoney(totals.amountInvoicedCents) };
  if (columnId === "remainingToInvoice") return { text: formatMoney(totals.remainingToInvoiceCents) };
  return subtotalCell(totals, columnId);
}

/**
 * The four numbers a PM checks before anything else: what the job sells for, what it
 * is now projected to cost, and the profit and margin that fall out of the two. They
 * are always shown, whatever column view is selected, because a view that hides the
 * price column shouldn't also hide whether the job is making money.
 */
function SummaryStrip({ totals }: { totals: FunnelTotals }) {
  const losing = totals.projectedProfitCents < 0;
  const tiles = [
    { label: "Revised price", value: formatMoney(totals.revisedClientPriceCents) },
    { label: "Projected cost", value: formatMoney(totals.projectedCostCents) },
    { label: "Projected profit", value: formatMoney(totals.projectedProfitCents), danger: losing },
    { label: "Margin", value: formatPercent(totals.projectedMarginBasisPoints), danger: losing },
  ];

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {tiles.map((tile) => (
        <div
          key={tile.label}
          className="rounded-lg border bg-[var(--bt-panel-bg)] px-4 py-3"
          style={{ borderColor: "var(--bt-border)" }}
        >
          <div className="text-xs font-semibold uppercase tracking-wide text-[var(--bt-muted)]">{tile.label}</div>
          <div
            className="mt-1 text-xl font-semibold"
            style={{ color: tile.danger ? "var(--bt-danger)" : "var(--bt-text)" }}
          >
            {tile.value}
          </div>
        </div>
      ))}
    </div>
  );
}

export default async function JobBudgetPage({ params, searchParams }: PageProps<"/jobs/[jobId]/budget">) {
  const { jobId } = await params;

  let user;
  try {
    user = await currentAppUser();
  } catch (error) {
    return <SetupNotice detail={error instanceof Error ? error.message : String(error)} />;
  }
  if (!user) {
    return <SetupNotice detail="No organization found. Seed the database, then reload." />;
  }

  let view;
  try {
    view = await getJobBudget(jobId, user.organizationId);
  } catch (error) {
    if (error instanceof JobNotFoundError) notFound();
    throw error;
  }

  // JobBudgetView.columns is typed as `readonly string[]`, but it's always the
  // result of ContractTypePolicy.budgetColumns() — narrow it back for the lookup tables below.
  const contractTypeColumns = view.columns as readonly BudgetColumnId[];

  const { view: viewParam } = await searchParams;
  const selectedBudgetView = budgetViewByKey(typeof viewParam === "string" ? viewParam : "standard");
  // Intersect with what this contract type actually exposes — e.g. Open Book has no
  // "original client price" column, so Standard just renders without it here.
  const columns = contractTypeColumns.filter((id) =>
    (selectedBudgetView.columns as readonly BudgetColumnId[]).includes(id),
  );

  const groups = groupFunnelLines(view.funnel.lines, view.costCodes).map((group) => ({
    key: group.key,
    code: group.code,
    name: group.name,
    hasOverBudgetLine: group.hasOverBudgetLine,
    subtotalCells: columns.map((columnId) => subtotalCell(group.subtotal, columnId)),
    rows: group.lines.map((entry) => ({
      key: entry.line.costCodeId,
      code: entry.code,
      name: entry.name,
      unbudgeted: entry.line.isUnbudgeted,
      cells: columns.map((columnId) => lineCell(entry.line, columnId)),
    })),
  }));

  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold text-[var(--bt-text)]">Job costing — {view.job.name}</h1>
        <span className="text-xs text-[var(--bt-muted)]">
          {view.job.projectionReference === "GREATEST"
            ? "Projected at worst of budget/committed/actual"
            : view.job.projectionReference}
        </span>
      </div>

      <SummaryStrip totals={view.funnel.totals} />

      <div className="flex flex-wrap gap-2 border-b pb-2" style={{ borderColor: "var(--bt-border)" }}>
        {BUDGET_VIEWS.map((budgetView) => (
          <Link
            key={budgetView.key}
            href={`/jobs/${jobId}/budget?view=${budgetView.key}`}
            className="rounded px-3 py-1.5 text-sm font-medium"
            style={
              selectedBudgetView.key === budgetView.key
                ? { background: "var(--bt-primary)", color: "var(--bt-on-primary)" }
                : { color: "var(--bt-muted)" }
            }
          >
            {budgetView.label}
          </Link>
        ))}
      </div>

      <BudgetGrid
        columnLabels={columns.map((columnId) => COLUMN_LABELS[columnId])}
        groups={groups}
        totalCells={columns.map((columnId) => totalsCell(view.funnel.totals, columnId))}
      />
    </div>
  );
}
