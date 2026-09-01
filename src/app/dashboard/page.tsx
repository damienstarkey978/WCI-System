import Link from "next/link";
import { redirect } from "next/navigation";

import { SetupNotice } from "@/app/admin/setup-notice";
import { DashboardFunGreeting } from "@/app/dashboard/fun-greeting";
import { AppShell } from "@/components/shell/AppShell";
import { JarvisChatPanel } from "@/components/jarvis/JarvisChatPanel";
import { notificationBellDataForUser, sidebarJobsForOrg } from "@/components/shell/data";
import { UserRole } from "@/generated/prisma/enums";
import { currentAppUserOrRedirect } from "@/lib/auth";
import { isAnthropicConfigured } from "@/lib/env";
import { formatDate, formatMoney, formatPercent } from "@/lib/format";
import { getDailyBrief } from "@/lib/reports/daily-brief";
import {
  getBudgetedVsProjectedReport,
  getCashFlowReport,
  getInvoicingReport,
  getProfitabilityReport,
  getWipReport,
} from "@/lib/reports/service";

const BUSINESS_ADVISOR_SUGGESTIONS = [
  "What needs my attention today?",
  "Which invoices are overdue?",
  "Are any jobs over budget?",
  "How profitable are my jobs?",
  "Which milestones can I bill?",
  "Which proposals need follow-up?",
] as const;

export const dynamic = "force-dynamic";

function Tile({ label, value, warn, href }: { label: string; value: string; warn?: boolean; href?: string }) {
  const body = (
    <div className="rounded-lg border bg-[var(--bt-panel-bg)] p-4" style={{ borderColor: "var(--bt-border)" }}>
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
  // This dashboard is company-wide financials — FIELD's role has no visibility into
  // that (src/lib/job-access.ts), so send them to the jobs they're actually granted
  // instead of a dead-end denial page.
  if (user.role === UserRole.FIELD) {
    redirect("/jobs");
  }

  const [jobs, bell, wip, profitability, budgetVariance, invoicing, cashFlow, dailyBrief] = await Promise.all([
    sidebarJobsForOrg(user.organizationId, user),
    notificationBellDataForUser(user.organizationId, user.id),
    getWipReport(user.organizationId),
    getProfitabilityReport(user.organizationId),
    getBudgetedVsProjectedReport(user.organizationId),
    getInvoicingReport(user.organizationId),
    getCashFlowReport(user.organizationId, { windowDays: 30 }),
    getDailyBrief(user.organizationId),
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

        {isAnthropicConfigured() ? <DashboardFunGreeting /> : null}

        {isAnthropicConfigured() ? (
          <JarvisChatPanel
            context={{ page: "dashboard" }}
            storageKey="dashboard-business-advisor"
            suggestions={BUSINESS_ADVISOR_SUGGESTIONS}
            emptyStateHint="Ask Jarvis how the business is doing — which invoices are overdue, whether any jobs are over budget, which proposals need a nudge — and it'll answer from your real numbers."
            heightClassName="h-80"
          />
        ) : null}

        <section className="rounded-lg border bg-[var(--bt-panel-bg)] p-4" style={{ borderColor: "var(--bt-border)" }}>
          <h2 className="text-sm font-semibold text-[var(--bt-text)]">Daily brief</h2>
          <p className="text-xs text-[var(--bt-muted)]">What needs attention across the whole business right now.</p>
          <ul className="mt-3 flex flex-col gap-2 text-sm">
            <li className="flex items-center justify-between">
              <span className="text-[var(--bt-text)]">Overdue invoices</span>
              {dailyBrief.overdueInvoices.length === 0 ? (
                <span className="text-[var(--bt-muted)]">None</span>
              ) : (
                <Link href="/reports?report=invoicing" className="font-semibold text-[var(--bt-primary)] hover:underline">
                  {dailyBrief.overdueInvoices.length} totaling {formatMoney(dailyBrief.overdueInvoiceTotalCents)}
                </Link>
              )}
            </li>
            <li className="flex items-center justify-between">
              <span className="text-[var(--bt-text)]">Jobs over budget</span>
              {dailyBrief.jobsOverBudget.length === 0 ? (
                <span className="text-[var(--bt-muted)]">None</span>
              ) : (
                <Link href="/reports?report=budget-variance" className="font-semibold text-[var(--bt-primary)] hover:underline">
                  {dailyBrief.jobsOverBudget.map((job) => job.jobName).join(", ")}
                </Link>
              )}
            </li>
            <li className="flex items-center justify-between">
              <span className="text-[var(--bt-text)]">Unapproved timesheets</span>
              <span className={dailyBrief.unapprovedShiftCount === 0 ? "text-[var(--bt-muted)]" : "font-semibold text-[var(--bt-text)]"}>
                {dailyBrief.unapprovedShiftCount === 0 ? "None" : dailyBrief.unapprovedShiftCount}
              </span>
            </li>
            <li className="flex items-center justify-between">
              <span className="text-[var(--bt-text)]">Change orders pending approval</span>
              <span className={dailyBrief.pendingChangeOrderCount === 0 ? "text-[var(--bt-muted)]" : "font-semibold text-[var(--bt-text)]"}>
                {dailyBrief.pendingChangeOrderCount === 0 ? "None" : dailyBrief.pendingChangeOrderCount}
              </span>
            </li>
            <li className="flex items-center justify-between">
              <span className="text-[var(--bt-text)]">Proposals needing follow-up</span>
              {dailyBrief.proposalsNeedingFollowUp.length === 0 ? (
                <span className="text-[var(--bt-muted)]">None</span>
              ) : (
                <Link href="/leads/proposals" className="font-semibold text-[var(--bt-primary)] hover:underline">
                  {dailyBrief.proposalsNeedingFollowUp.map((proposal) => `${proposal.title} (sent ${formatDate(proposal.sentAt)})`).join(", ")}
                </Link>
              )}
            </li>
            <li className="flex items-center justify-between">
              <span className="text-[var(--bt-text)]">Billable milestones ready</span>
              {dailyBrief.billableMilestones.length === 0 ? (
                <span className="text-[var(--bt-muted)]">None</span>
              ) : (
                <span className="font-semibold text-[var(--bt-text)]">{dailyBrief.billableMilestones.map((milestone) => milestone.title).join(", ")}</span>
              )}
            </li>
            <li className="flex items-center justify-between">
              <span className="text-[var(--bt-text)]">Cost inbox awaiting review</span>
              <span className={dailyBrief.costInboxItems.length === 0 ? "text-[var(--bt-muted)]" : "font-semibold text-[var(--bt-text)]"}>
                {dailyBrief.costInboxItems.length === 0 ? "None" : `${dailyBrief.costInboxItems.length} bill(s)`}
              </span>
            </li>
          </ul>
        </section>

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

        <section className="rounded-lg border bg-[var(--bt-panel-bg)] p-4" style={{ borderColor: "var(--bt-border)" }}>
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
