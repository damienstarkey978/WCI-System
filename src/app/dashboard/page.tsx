import Link from "next/link";

import { SetupNotice } from "@/app/admin/setup-notice";
import { AppShell } from "@/components/shell/AppShell";
import { notificationBellDataForUser, sidebarJobsForOrg } from "@/components/shell/data";
import { currentAppUserOrRedirect } from "@/lib/auth";
import { formatMoney, formatPercent } from "@/lib/format";
import {
  getBudgetedVsProjectedReport,
  getCashFlowReport,
  getInvoicingReport,
  getProfitabilityReport,
  getWipReport,
} from "@/lib/reports/service";

export const dynamic = "force-dynamic";

function Tile({ label, value, warn, href }: { label: string; value: string; warn?: boolean; href?: string }) {
  const body = (
    <div className="rounded-lg border bg-white p-4" style={{ borderColor: "var(--bt-border)" }}>
      <div className="text-xs font-semibold uppercase tracking-wide text-[var(--bt-muted)]">{label}</div>
      <div className="mt-1 text-2xl font-semibold" style={{ color: warn ? "#b91c1c" : "var(--bt-text)" }}>
        {value}
      </div>
    </div>
  );
  return href ? (
    <Link href={href} className="block transition hover:border-[var(--bt-primary)]">
      {body}
    </Link>
  ) : (
    body
  );
}

/**
 * The executive KPI dashboard (CLAUDE.md 3's "cross-project executive view"). A
 * thin aggregation over the six reports (src/lib/reports/service.ts) — no new
 * computation, just totals across the same per-job funnels every report reads,
 * so this page can never disagree with the Reports tab about a number.
 */
export default async function DashboardPage() {
  let user;
  try {
    user = await currentAppUserOrRedirect();
  } catch (error) {
    return <SetupNotice detail={error instanceof Error ? error.message : String(error)} />;
  }

  const [jobs, bell, wip, profitability, budgetVariance, invoicing, cashFlow] = await Promise.all([
    sidebarJobsForOrg(user.organizationId),
    notificationBellDataForUser(user.organizationId, user.id),
    getWipReport(user.organizationId),
    getProfitabilityReport(user.organizationId),
    getBudgetedVsProjectedReport(user.organizationId),
    getInvoicingReport(user.organizationId),
    getCashFlowReport(user.organizationId, { windowDays: 30 }),
  ]);

  const activeJobCount = wip.length;
  const totalContractValueCents = wip.reduce((sum, row) => sum + row.revisedClientPriceCents, 0);
  const totalProjectedProfitCents = profitability.reduce((sum, row) => sum + row.projectedProfitCents, 0);
  const avgMarginBasisPoints =
    activeJobCount === 0 ? 0 : Math.round(profitability.reduce((sum, row) => sum + row.projectedMarginBasisPoints, 0) / activeJobCount);
  const jobsOverBudgetCount = budgetVariance.filter((row) => row.isOverBudget).length;
  const totalOutstandingCents = invoicing.reduce((sum, row) => sum + row.outstandingCents, 0);
  const lowMarginJobs = profitability.filter((row) => row.projectedMarginBasisPoints < 1000).slice(0, 5);

  return (
    <AppShell jobs={jobs} notifications={bell.notifications} unreadCount={bell.unreadCount}>
      <div className="mx-auto flex max-w-6xl flex-col gap-4 p-6">
        <h1 className="text-xl font-semibold text-[var(--bt-text)]">Dashboard</h1>

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          <Tile label="Active jobs" value={String(activeJobCount)} href="/jobs" />
          <Tile label="Total contract value" value={formatMoney(totalContractValueCents)} href="/reports?report=wip" />
          <Tile label="Projected profit" value={formatMoney(totalProjectedProfitCents)} href="/reports?report=profitability" />
          <Tile label="Avg. projected margin" value={formatPercent(avgMarginBasisPoints)} href="/reports?report=profitability" />
          <Tile
            label="Jobs over budget"
            value={String(jobsOverBudgetCount)}
            warn={jobsOverBudgetCount > 0}
            href="/reports?report=budget-variance"
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <Tile label="Outstanding (unpaid)" value={formatMoney(totalOutstandingCents)} warn={totalOutstandingCents > 0} href="/reports?report=invoicing" />
          <Tile label="Cash in, last 30 days" value={formatMoney(cashFlow.historicalNetCents)} href="/reports?report=cash-flow" />
          <Tile label="Projected cash out" value={formatMoney(cashFlow.projection.projectedCashOutCents)} href="/reports?report=cash-flow" />
        </div>

        <section className="rounded-lg border bg-white p-4" style={{ borderColor: "var(--bt-border)" }}>
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-[var(--bt-text)]">Jobs needing attention (lowest margin)</h2>
            <Link href="/reports?report=profitability" className="text-xs font-semibold text-[var(--bt-primary)] hover:underline">
              View full report →
            </Link>
          </div>
          {lowMarginJobs.length === 0 ? (
            <p className="mt-2 text-sm text-[var(--bt-muted)]">No active jobs are running under a 10% projected margin.</p>
          ) : (
            <ul className="mt-2 divide-y" style={{ borderColor: "var(--bt-border)" }}>
              {lowMarginJobs.map((row) => (
                <li key={row.jobId} className="flex items-center justify-between py-2 text-sm">
                  <Link href={`/jobs/${row.jobId}`} className="font-medium text-[var(--bt-primary)] hover:underline">
                    {row.jobName}
                  </Link>
                  <span className="text-xs font-semibold" style={{ color: row.projectedMarginBasisPoints < 0 ? "#b91c1c" : "var(--bt-muted)" }}>
                    {formatPercent(row.projectedMarginBasisPoints)} margin
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </AppShell>
  );
}
