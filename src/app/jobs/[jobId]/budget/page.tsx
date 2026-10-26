import { notFound } from "next/navigation";

import { SetupNotice } from "@/app/admin/setup-notice";
import { currentAppUser } from "@/lib/auth";
import { getJobBudget, JobNotFoundError } from "@/lib/budget/service";
import type { FunnelLine, FunnelSubtotal, FunnelTotals } from "@/lib/budget/funnel";
import { BUDGET_COLUMN_LABELS } from "@/lib/budget/export";
import { groupFunnelLines } from "@/lib/budget/grouping";
import { BUDGET_VIEWS, budgetViewByKey, type BudgetColumnId } from "@/lib/contract-type";
import { formatMoney, formatPercent } from "@/lib/format";

import { BudgetGrid, type GridCell } from "./budget-grid";
import { BudgetViewSelect } from "./budget-view-select";
import { FinancialPageHeader } from "../financial-tabs";

export const dynamic = "force-dynamic";

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
 * Buildertrend's budget header equation: Revised price − Projected cost =
 * Projected profit, with margin called out beside it. Always shown, whatever
 * column view is selected.
 */
function SummaryStrip({ totals }: { totals: FunnelTotals }) {
  const losing = totals.projectedProfitCents < 0;
  return (
    <div
      className="flex flex-wrap items-center gap-4 rounded-lg border bg-[var(--bt-panel-bg)] px-4 py-3 sm:gap-6"
      style={{ borderColor: "var(--bt-border)" }}
    >
      <div>
        <div className="text-xs font-semibold uppercase tracking-wide text-[var(--bt-muted)]">Total revised price</div>
        <div className="mt-1 text-lg font-semibold text-[var(--bt-text)]">{formatMoney(totals.revisedClientPriceCents)}</div>
      </div>
      <div className="hidden h-10 w-px bg-[var(--bt-border)] sm:block" />
      <div>
        <div className="text-xs font-semibold uppercase tracking-wide text-[var(--bt-muted)]">Revised price</div>
        <div className="mt-1 text-lg font-semibold text-[var(--bt-text)]">{formatMoney(totals.revisedClientPriceCents)}</div>
      </div>
      <span className="text-lg text-[var(--bt-muted)]">−</span>
      <div>
        <div className="text-xs font-semibold uppercase tracking-wide text-[var(--bt-muted)]">Projected cost</div>
        <div className="mt-1 text-lg font-semibold text-[var(--bt-text)]">{formatMoney(totals.projectedCostCents)}</div>
      </div>
      <span className="text-lg text-[var(--bt-muted)]">=</span>
      <div>
        <div className="text-xs font-semibold uppercase tracking-wide text-[var(--bt-muted)]">Projected profit</div>
        <div className="mt-1 text-lg font-semibold" style={{ color: losing ? "var(--bt-danger)" : "var(--bt-text)" }}>
          {formatMoney(totals.projectedProfitCents)}
        </div>
      </div>
      <span
        className="rounded-full px-2.5 py-1 text-xs font-semibold"
        style={{
          background: losing
            ? "color-mix(in srgb, var(--bt-danger) 14%, transparent)"
            : "color-mix(in srgb, var(--bt-primary) 14%, transparent)",
          color: losing ? "var(--bt-danger)" : "var(--bt-primary)",
        }}
      >
        {formatPercent(totals.projectedMarginBasisPoints)} profit margin
      </span>
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
      <FinancialPageHeader
        jobName={view.job.name}
        title="Job Costing Budget"
        action={
          <div className="flex items-center gap-3">
            <span className="text-xs text-[var(--bt-muted)]">
              {view.job.projectionReference === "GREATEST"
                ? "Projected at worst of budget/committed/actual"
                : view.job.projectionReference}
            </span>
            {/* A download, not a page: a plain anchor, so no client-side navigation. */}
            <a
              href={`/jobs/${jobId}/budget/export?view=${selectedBudgetView.key}`}
              className="rounded border px-3 py-2 text-sm font-medium text-[var(--bt-text)]"
              style={{ borderColor: "var(--bt-border)" }}
            >
              Export
            </a>
          </div>
        }
      />

      <SummaryStrip totals={view.funnel.totals} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav className="flex gap-1 border-b" style={{ borderColor: "var(--bt-border)" }}>
          {[
            { key: "standard", label: "Cost categories" },
            { key: "job-costing", label: "Job costing" },
          ].map((tab) => {
            const isActive = selectedBudgetView.key === tab.key;
            return (
              <a
                key={tab.key}
                href={`/jobs/${jobId}/budget?view=${tab.key}`}
                className="-mb-px border-b-2 px-3 py-2 text-sm font-medium transition"
                style={{
                  borderColor: isActive ? "var(--bt-primary)" : "transparent",
                  color: isActive ? "var(--bt-primary)" : "var(--bt-muted)",
                }}
              >
                {tab.label}
              </a>
            );
          })}
        </nav>
        <BudgetViewSelect
          jobId={jobId}
          views={BUDGET_VIEWS.map((v) => ({ key: v.key, label: v.label }))}
          selectedKey={selectedBudgetView.key}
        />
      </div>

      <BudgetGrid
        columnLabels={columns.map((columnId) => BUDGET_COLUMN_LABELS[columnId])}
        groups={groups}
        totalCells={columns.map((columnId) => totalsCell(view.funnel.totals, columnId))}
      />
    </div>
  );
}
