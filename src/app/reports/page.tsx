import Link from "next/link";
import type { ReactNode } from "react";

import { AppShell } from "@/components/shell/AppShell";
import { notificationBellDataForUser, sidebarJobsForOrg } from "@/components/shell/data";
import { SetupNotice } from "@/app/admin/setup-notice";
import { currentAppUserOrRedirect } from "@/lib/auth";
import { formatMoney, formatPercent } from "@/lib/format";
import {
  getBudgetedVsProjectedReport,
  getCashFlowReport,
  getInvoicingReport,
  getLaborReport,
  getProfitabilityReport,
  getWipReport,
} from "@/lib/reports/service";

export const dynamic = "force-dynamic";

const REPORTS = [
  { key: "wip", label: "WIP" },
  { key: "budget-variance", label: "Budgeted vs Projected" },
  { key: "profitability", label: "Profitability" },
  { key: "invoicing", label: "Invoicing" },
  { key: "labor", label: "Labor" },
  { key: "cash-flow", label: "Cash Flow" },
] as const;

type ReportKey = (typeof REPORTS)[number]["key"];

function Th({ children, right }: { children: ReactNode; right?: boolean }) {
  return <th className={`px-4 py-3 ${right ? "text-right" : "text-left"}`}>{children}</th>;
}

function Td({ children, right, warn }: { children: ReactNode; right?: boolean; warn?: boolean }) {
  return (
    <td className={`px-4 py-2 ${right ? "text-right" : "text-left"}`} style={warn ? { color: "#b91c1c", fontWeight: 600 } : { color: "var(--bt-text)" }}>
      {children}
    </td>
  );
}

export default async function ReportsPage({ searchParams }: PageProps<"/reports">) {
  let user;
  try {
    user = await currentAppUserOrRedirect();
  } catch (error) {
    return <SetupNotice detail={error instanceof Error ? error.message : String(error)} />;
  }

  const [jobs, bell] = await Promise.all([
    sidebarJobsForOrg(user.organizationId),
    notificationBellDataForUser(user.organizationId, user.id),
  ]);

  const { report } = await searchParams;
  const active: ReportKey = REPORTS.some((r) => r.key === report) ? (report as ReportKey) : "wip";

  return (
    <AppShell jobs={jobs} notifications={bell.notifications} unreadCount={bell.unreadCount}>
      <div className="mx-auto flex max-w-6xl flex-col gap-4 p-6">
        <h1 className="text-xl font-semibold text-[var(--bt-text)]">Reports</h1>

        <div className="flex flex-wrap gap-2 border-b pb-2" style={{ borderColor: "var(--bt-border)" }}>
          {REPORTS.map((r) => (
            <Link
              key={r.key}
              href={`/reports?report=${r.key}`}
              className="rounded px-3 py-1.5 text-sm font-medium"
              style={
                active === r.key
                  ? { background: "var(--bt-primary)", color: "white" }
                  : { color: "var(--bt-muted)" }
              }
            >
              {r.label}
            </Link>
          ))}
        </div>

        <div className="overflow-x-auto rounded-lg border bg-white" style={{ borderColor: "var(--bt-border)" }}>
          {active === "wip" ? <WipTable organizationId={user.organizationId} /> : null}
          {active === "budget-variance" ? <BudgetVarianceTable organizationId={user.organizationId} /> : null}
          {active === "profitability" ? <ProfitabilityTable organizationId={user.organizationId} /> : null}
          {active === "invoicing" ? <InvoicingTable organizationId={user.organizationId} /> : null}
          {active === "labor" ? <LaborTable organizationId={user.organizationId} /> : null}
          {active === "cash-flow" ? <CashFlowTable organizationId={user.organizationId} /> : null}
        </div>
      </div>
    </AppShell>
  );
}

async function WipTable({ organizationId }: { organizationId: string }) {
  const rows = await getWipReport(organizationId);
  return (
    <table className="w-full min-w-max text-sm">
      <thead>
        <tr className="border-b text-xs font-semibold uppercase tracking-wide text-[var(--bt-muted)]" style={{ borderColor: "var(--bt-border)" }}>
          <Th>Job</Th>
          <Th right>Contract price</Th>
          <Th right>% complete</Th>
          <Th right>Earned revenue</Th>
          <Th right>Invoiced</Th>
          <Th right>Over/under billed</Th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.jobId} className="border-b last:border-0" style={{ borderColor: "var(--bt-border)" }}>
            <Td>{row.jobName}</Td>
            <Td right>{formatMoney(row.revisedClientPriceCents)}</Td>
            <Td right>{formatPercent(row.percentCompleteBasisPoints)}</Td>
            <Td right>{formatMoney(row.earnedRevenueCents)}</Td>
            <Td right>{formatMoney(row.amountInvoicedCents)}</Td>
            <Td right warn={row.overUnderBillingCents > 0}>{formatMoney(row.overUnderBillingCents)}</Td>
          </tr>
        ))}
        {rows.length === 0 ? (
          <tr>
            <td colSpan={6} className="px-4 py-6 text-center text-[var(--bt-muted)]">No active jobs.</td>
          </tr>
        ) : null}
      </tbody>
    </table>
  );
}

async function BudgetVarianceTable({ organizationId }: { organizationId: string }) {
  const rows = await getBudgetedVsProjectedReport(organizationId);
  return (
    <table className="w-full min-w-max text-sm">
      <thead>
        <tr className="border-b text-xs font-semibold uppercase tracking-wide text-[var(--bt-muted)]" style={{ borderColor: "var(--bt-border)" }}>
          <Th>Job</Th>
          <Th right>Original budget</Th>
          <Th right>Revised budget</Th>
          <Th right>Projected cost</Th>
          <Th right>Variance</Th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.jobId} className="border-b last:border-0" style={{ borderColor: "var(--bt-border)" }}>
            <Td>{row.jobName}</Td>
            <Td right>{formatMoney(row.originalBudgetCostCents)}</Td>
            <Td right>{formatMoney(row.revisedBudgetCostCents)}</Td>
            <Td right>{formatMoney(row.projectedCostCents)}</Td>
            <Td right warn={row.isOverBudget}>{formatMoney(row.varianceCents)}</Td>
          </tr>
        ))}
        {rows.length === 0 ? (
          <tr>
            <td colSpan={5} className="px-4 py-6 text-center text-[var(--bt-muted)]">No active jobs.</td>
          </tr>
        ) : null}
      </tbody>
    </table>
  );
}

async function ProfitabilityTable({ organizationId }: { organizationId: string }) {
  const rows = await getProfitabilityReport(organizationId);
  return (
    <table className="w-full min-w-max text-sm">
      <thead>
        <tr className="border-b text-xs font-semibold uppercase tracking-wide text-[var(--bt-muted)]" style={{ borderColor: "var(--bt-border)" }}>
          <Th>Job</Th>
          <Th right>Contract price</Th>
          <Th right>Projected cost</Th>
          <Th right>Projected profit</Th>
          <Th right>Margin</Th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.jobId} className="border-b last:border-0" style={{ borderColor: "var(--bt-border)" }}>
            <Td>{row.jobName}</Td>
            <Td right>{formatMoney(row.revisedClientPriceCents)}</Td>
            <Td right>{formatMoney(row.projectedCostCents)}</Td>
            <Td right>{formatMoney(row.projectedProfitCents)}</Td>
            <Td right warn={row.projectedMarginBasisPoints < 1000}>{formatPercent(row.projectedMarginBasisPoints)}</Td>
          </tr>
        ))}
        {rows.length === 0 ? (
          <tr>
            <td colSpan={5} className="px-4 py-6 text-center text-[var(--bt-muted)]">No active jobs.</td>
          </tr>
        ) : null}
      </tbody>
    </table>
  );
}

async function InvoicingTable({ organizationId }: { organizationId: string }) {
  const rows = await getInvoicingReport(organizationId);
  return (
    <table className="w-full min-w-max text-sm">
      <thead>
        <tr className="border-b text-xs font-semibold uppercase tracking-wide text-[var(--bt-muted)]" style={{ borderColor: "var(--bt-border)" }}>
          <Th>Job</Th>
          <Th right>Contract price</Th>
          <Th right>Invoiced</Th>
          <Th right>Remaining to invoice</Th>
          <Th right>Paid</Th>
          <Th right>Outstanding</Th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.jobId} className="border-b last:border-0" style={{ borderColor: "var(--bt-border)" }}>
            <Td>{row.jobName}</Td>
            <Td right>{formatMoney(row.revisedClientPriceCents)}</Td>
            <Td right>{formatMoney(row.amountInvoicedCents)}</Td>
            <Td right>{formatMoney(row.remainingToInvoiceCents)}</Td>
            <Td right>{formatMoney(row.totalPaidCents)}</Td>
            <Td right warn={row.outstandingCents > 0}>{formatMoney(row.outstandingCents)}</Td>
          </tr>
        ))}
        {rows.length === 0 ? (
          <tr>
            <td colSpan={6} className="px-4 py-6 text-center text-[var(--bt-muted)]">No active jobs.</td>
          </tr>
        ) : null}
      </tbody>
    </table>
  );
}

async function LaborTable({ organizationId }: { organizationId: string }) {
  const rows = await getLaborReport(organizationId);
  return (
    <table className="w-full min-w-max text-sm">
      <thead>
        <tr className="border-b text-xs font-semibold uppercase tracking-wide text-[var(--bt-muted)]" style={{ borderColor: "var(--bt-border)" }}>
          <Th>Job</Th>
          <Th right>Budgeted labor</Th>
          <Th right>Approved labor</Th>
          <Th right>Variance</Th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.jobId} className="border-b last:border-0" style={{ borderColor: "var(--bt-border)" }}>
            <Td>{row.jobName}</Td>
            <Td right>{formatMoney(row.budgetedLaborCostCents)}</Td>
            <Td right>{formatMoney(row.approvedLaborCostCents)}</Td>
            <Td right warn={row.isOverBudget}>{formatMoney(row.varianceCents)}</Td>
          </tr>
        ))}
        {rows.length === 0 ? (
          <tr>
            <td colSpan={4} className="px-4 py-6 text-center text-[var(--bt-muted)]">No active jobs.</td>
          </tr>
        ) : null}
      </tbody>
    </table>
  );
}

async function CashFlowTable({ organizationId }: { organizationId: string }) {
  const report = await getCashFlowReport(organizationId, { windowDays: 30 });
  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="grid grid-cols-3 gap-4 text-sm">
        <div>
          <div className="text-xs text-[var(--bt-muted)]">Net cash (last 30 days)</div>
          <div className="font-semibold text-[var(--bt-text)]">{formatMoney(report.historicalNetCents)}</div>
        </div>
        <div>
          <div className="text-xs text-[var(--bt-muted)]">Projected cash in</div>
          <div className="font-semibold text-[var(--bt-text)]">{formatMoney(report.projection.projectedCashInCents)}</div>
        </div>
        <div>
          <div className="text-xs text-[var(--bt-muted)]">Projected cash out</div>
          <div className="font-semibold text-[var(--bt-text)]">{formatMoney(report.projection.projectedCashOutCents)}</div>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-max text-sm">
          <thead>
            <tr className="border-b text-xs font-semibold uppercase tracking-wide text-[var(--bt-muted)]" style={{ borderColor: "var(--bt-border)" }}>
              <Th>Date</Th>
              <Th right>Cash in</Th>
              <Th right>Cash out</Th>
              <Th right>Net</Th>
            </tr>
          </thead>
          <tbody>
            {report.historical.map((day) => (
              <tr key={day.date} className="border-b last:border-0" style={{ borderColor: "var(--bt-border)" }}>
                <Td>{day.date}</Td>
                <Td right>{formatMoney(day.cashInCents)}</Td>
                <Td right>{formatMoney(day.cashOutCents)}</Td>
                <Td right warn={day.netCents < 0}>{formatMoney(day.netCents)}</Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
