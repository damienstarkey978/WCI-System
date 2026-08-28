import Link from "next/link";
import { notFound } from "next/navigation";

import { SetupNotice } from "@/app/admin/setup-notice";
import { currentAppUser } from "@/lib/auth";
import { getJobBudget, JobNotFoundError } from "@/lib/budget/service";
import type { FunnelLine, FunnelTotals } from "@/lib/budget/funnel";
import { BUDGET_VIEWS, budgetViewByKey, type BudgetColumnId } from "@/lib/contract-type";
import { formatMoney, formatPercent } from "@/lib/format";

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

function lineCell(line: FunnelLine, columnId: BudgetColumnId): string {
  switch (columnId) {
    case "originalBudgetCost":
      return formatMoney(line.originalBudgetCostCents);
    case "revisedBudgetCost":
      return formatMoney(line.revisedBudgetCostCents);
    case "pendingCost":
      return formatMoney(line.pendingCostCents);
    case "committedCost":
      return formatMoney(line.committedCostCents);
    case "actualCost":
      return formatMoney(line.actualCostCents);
    case "projectedCost":
      return formatMoney(line.projectedCostCents);
    case "costToComplete":
      return formatMoney(line.costToCompleteCents);
    case "originalClientPrice":
      return formatMoney(line.originalClientPriceCents);
    case "revisedClientPrice":
      return formatMoney(line.revisedClientPriceCents);
    case "projectedProfit":
      return formatMoney(line.projectedProfitCents);
    case "projectedMarginPct":
      return formatPercent(line.projectedMarginBasisPoints);
    // Invoicing is tracked at the job level only — a single progress invoice bills
    // against the whole contract, not a specific cost code (CLAUDE.md 2.3).
    case "amountInvoiced":
    case "remainingToInvoice":
      return "—";
  }
}

function totalsCell(totals: FunnelTotals, columnId: BudgetColumnId): string {
  switch (columnId) {
    case "originalBudgetCost":
      return formatMoney(totals.originalBudgetCostCents);
    case "revisedBudgetCost":
      return formatMoney(totals.revisedBudgetCostCents);
    case "pendingCost":
      return formatMoney(totals.pendingCostCents);
    case "committedCost":
      return formatMoney(totals.committedCostCents);
    case "actualCost":
      return formatMoney(totals.actualCostCents);
    case "projectedCost":
      return formatMoney(totals.projectedCostCents);
    case "costToComplete":
      return formatMoney(totals.costToCompleteCents);
    case "originalClientPrice":
      return formatMoney(totals.originalClientPriceCents);
    case "revisedClientPrice":
      return formatMoney(totals.revisedClientPriceCents);
    case "amountInvoiced":
      return formatMoney(totals.amountInvoicedCents);
    case "remainingToInvoice":
      return formatMoney(totals.remainingToInvoiceCents);
    case "projectedProfit":
      return formatMoney(totals.projectedProfitCents);
    case "projectedMarginPct":
      return formatPercent(totals.projectedMarginBasisPoints);
  }
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

  let rawView;
  try {
    rawView = await getJobBudget(jobId, user.organizationId);
  } catch (error) {
    if (error instanceof JobNotFoundError) notFound();
    throw error;
  }

  // JobBudgetView.columns is typed as `readonly string[]`, but it's always the
  // result of ContractTypePolicy.budgetColumns() — narrow it back for the lookup tables below.
  const contractTypeColumns = rawView.columns as readonly BudgetColumnId[];

  const { view: viewParam } = await searchParams;
  const selectedBudgetView = budgetViewByKey(typeof viewParam === "string" ? viewParam : "standard");
  // Intersect with what this contract type actually exposes — e.g. Open Book has no
  // "original client price" column, so Standard just renders without it here.
  const columns = contractTypeColumns.filter((id) => (selectedBudgetView.columns as readonly BudgetColumnId[]).includes(id));

  const view = { ...rawView, columns };

  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-[var(--bt-text)]">Job costing — {view.job.name}</h1>
        <span className="text-xs text-[var(--bt-muted)]">
          {view.job.projectionReference === "GREATEST" ? "Projected at worst of budget/committed/actual" : view.job.projectionReference}
        </span>
      </div>

      <div className="flex flex-wrap gap-2 border-b pb-2" style={{ borderColor: "var(--bt-border)" }}>
        {BUDGET_VIEWS.map((budgetView) => (
          <Link
            key={budgetView.key}
            href={`/jobs/${jobId}/budget?view=${budgetView.key}`}
            className="rounded px-3 py-1.5 text-sm font-medium"
            style={
              selectedBudgetView.key === budgetView.key
                ? { background: "var(--bt-primary)", color: "white" }
                : { color: "var(--bt-muted)" }
            }
          >
            {budgetView.label}
          </Link>
        ))}
      </div>

      <div className="overflow-x-auto rounded-lg border bg-white" style={{ borderColor: "var(--bt-border)" }}>
        <table className="w-full min-w-max text-sm">
          <thead>
            <tr className="border-b text-xs font-semibold uppercase tracking-wide text-[var(--bt-muted)]" style={{ borderColor: "var(--bt-border)" }}>
              <th className="sticky left-0 bg-white px-4 py-3 text-left">Cost code</th>
              {view.columns.map((columnId) => (
                <th key={columnId} className="whitespace-nowrap px-4 py-3 text-right">
                  {COLUMN_LABELS[columnId]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {view.funnel.lines.map((line) => {
              const costCode = view.costCodes[line.costCodeId];
              return (
                <tr key={line.costCodeId} className="border-b last:border-0" style={{ borderColor: "var(--bt-border)" }}>
                  <td className="sticky left-0 whitespace-nowrap bg-white px-4 py-2">
                    <span className="font-mono text-xs text-[var(--bt-muted)]">{costCode?.code}</span>{" "}
                    <span className="text-[var(--bt-text)]">{costCode?.name}</span>
                  </td>
                  {view.columns.map((columnId) => (
                    <td
                      key={columnId}
                      className="whitespace-nowrap px-4 py-2 text-right"
                      style={line.isOverBudget && columnId === "projectedCost" ? { color: "#b91c1c", fontWeight: 600 } : { color: "var(--bt-text)" }}
                    >
                      {lineCell(line, columnId)}
                    </td>
                  ))}
                </tr>
              );
            })}
            {view.funnel.lines.length === 0 ? (
              <tr>
                <td colSpan={view.columns.length + 1} className="px-4 py-6 text-center text-[var(--bt-muted)]">
                  No budget lines yet.
                </td>
              </tr>
            ) : null}
          </tbody>
          {view.funnel.lines.length > 0 ? (
            <tfoot>
              <tr className="border-t-2 font-semibold" style={{ borderColor: "var(--bt-border)" }}>
                <td className="sticky left-0 bg-white px-4 py-3 text-[var(--bt-text)]">Total</td>
                {view.columns.map((columnId) => (
                  <td key={columnId} className="whitespace-nowrap px-4 py-3 text-right text-[var(--bt-text)]">
                    {totalsCell(view.funnel.totals, columnId)}
                  </td>
                ))}
              </tr>
            </tfoot>
          ) : null}
        </table>
      </div>
    </div>
  );
}
