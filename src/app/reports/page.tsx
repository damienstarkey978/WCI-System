import Link from "next/link";
import type { ReactNode } from "react";

import { AppShell } from "@/components/shell/AppShell";
import { notificationBellDataForUser, sidebarJobsForOrg } from "@/components/shell/data";
import { SetupNotice } from "@/app/admin/setup-notice";
import { LeadStage, UserRole } from "@/generated/prisma/enums";
import { currentAppUserOrRedirect } from "@/lib/auth";
import { formatDate, formatMoney, formatPercent } from "@/lib/format";
import {
  getBaselineVsActualDurationReport,
  getBudgetedVsProjectedReport,
  getCashFlowReport,
  getChangeOrderProfitReport,
  getDailyLogCountByUserReport,
  getDailyLogCreationByJobReport,
  getHoursWorkedByEmployeeReport,
  getHoursWorkedByJobReport,
  getInvoicingReport,
  getLaborReport,
  getLeadActivitiesBySalespersonReport,
  getLeadCountBySalespersonReport,
  getLeadStatusBySourceReport,
  getProfitabilityReport,
  getWipReport,
} from "@/lib/reports/service";

export const dynamic = "force-dynamic";

const CATEGORIES = ["All", "Financial", "Project Management", "Sales"] as const;
type Category = (typeof CATEGORIES)[number];

const REPORTS = [
  { key: "wip", label: "WIP", category: "Financial" },
  { key: "budget-variance", label: "Budgeted vs Projected", category: "Financial" },
  { key: "profitability", label: "Profitability", category: "Financial" },
  { key: "invoicing", label: "Invoicing", category: "Financial" },
  { key: "labor", label: "Labor Actuals vs Budgeted", category: "Financial" },
  { key: "cash-flow", label: "Cash Flow", category: "Financial" },
  { key: "change-order-profit", label: "Change Order Profit", category: "Project Management" },
  { key: "baseline-duration", label: "Baseline vs Actual Duration", category: "Project Management" },
  { key: "daily-log-by-user", label: "Daily Log Count by User", category: "Project Management" },
  { key: "daily-log-by-job", label: "Daily Log Creation by Job", category: "Project Management" },
  { key: "hours-by-employee", label: "Hours Worked, by Employee", category: "Project Management" },
  { key: "hours-by-job", label: "Hours Worked, by Job", category: "Project Management" },
  { key: "lead-activities-by-salesperson", label: "Lead Activities by Salesperson", category: "Sales" },
  { key: "lead-count-by-salesperson", label: "Lead Count by Salesperson", category: "Sales" },
  { key: "lead-status-by-source", label: "Lead Status by Source", category: "Sales" },
] as const satisfies readonly { key: string; label: string; category: Exclude<Category, "All"> }[];

type ReportKey = (typeof REPORTS)[number]["key"];

const LEAD_STAGES = Object.values(LeadStage);
const LEAD_STAGE_LABEL: Record<LeadStage, string> = {
  [LeadStage.NEW]: "New",
  [LeadStage.CONTACTED]: "Contacted",
  [LeadStage.QUALIFIED]: "Qualified",
  [LeadStage.PROPOSAL_SENT]: "Proposal sent",
  [LeadStage.WON]: "Won",
  [LeadStage.LOST]: "Lost",
};

function Th({ children, right }: { children: ReactNode; right?: boolean }) {
  return <th className={`px-4 py-3 ${right ? "text-right" : "text-left"}`}>{children}</th>;
}

function Td({ children, right, warn }: { children: ReactNode; right?: boolean; warn?: boolean }) {
  return (
    <td className={`px-4 py-2 ${right ? "text-right" : "text-left"}`} style={warn ? { color: "var(--bt-danger)", fontWeight: 600 } : { color: "var(--bt-text)" }}>
      {children}
    </td>
  );
}

function EmptyRow({ colSpan, label = "No active jobs." }: { colSpan: number; label?: string }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-4 py-6 text-center text-[var(--bt-muted)]">
        {label}
      </td>
    </tr>
  );
}

export default async function ReportsPage({ searchParams }: PageProps<"/reports">) {
  let user;
  try {
    user = await currentAppUserOrRedirect();
  } catch (error) {
    return <SetupNotice detail={error instanceof Error ? error.message : String(error)} />;
  }
  if (user.role === UserRole.FIELD) {
    return (
      <div className="mx-auto max-w-2xl p-6">
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
          Reports show company-wide financials, which your role doesn&apos;t have access to.{" "}
          <Link href="/jobs" className="font-semibold underline">
            Back to your jobs
          </Link>
        </div>
      </div>
    );
  }

  const [jobs, bell] = await Promise.all([
    sidebarJobsForOrg(user.organizationId, user),
    notificationBellDataForUser(user.organizationId, user.id),
  ]);

  const { report, category: categoryParam } = await searchParams;
  const category: Category = CATEGORIES.includes(categoryParam as Category) ? (categoryParam as Category) : "All";
  const visibleReports = category === "All" ? REPORTS : REPORTS.filter((r) => r.category === category);
  const active: ReportKey = REPORTS.some((r) => r.key === report) ? (report as ReportKey) : visibleReports[0].key;

  return (
    <AppShell jobs={jobs} notifications={bell.notifications} unreadCount={bell.unreadCount}>
      <div className="mx-auto flex max-w-6xl flex-col gap-4 p-6">
        <div>
          <h1 className="text-xl font-semibold text-[var(--bt-text)]">Reports</h1>
          <p className="text-sm text-[var(--bt-muted)]">Use reports to see job performance, spot issues early, and keep every project on track.</p>
        </div>

        <div className="flex gap-1 overflow-x-auto border-b" style={{ borderColor: "var(--bt-border)" }}>
          {CATEGORIES.map((c) => (
            <Link
              key={c}
              href={`/reports?category=${c}`}
              className="shrink-0 border-b-2 px-3 py-2 text-sm font-medium whitespace-nowrap"
              style={category === c ? { borderColor: "var(--bt-primary)", color: "var(--bt-primary)" } : { borderColor: "transparent", color: "var(--bt-muted)" }}
            >
              {c}
            </Link>
          ))}
        </div>

        <div className="flex flex-wrap gap-2">
          {visibleReports.map((r) => (
            <Link
              key={r.key}
              href={`/reports?category=${category}&report=${r.key}`}
              className="rounded px-3 py-1.5 text-sm font-medium"
              style={active === r.key ? { background: "var(--bt-primary)", color: "var(--bt-on-primary)" } : { background: "var(--bt-panel-bg)", color: "var(--bt-muted)" }}
            >
              {r.label}
            </Link>
          ))}
        </div>

        <div className="overflow-x-auto rounded-lg border bg-[var(--bt-panel-bg)]" style={{ borderColor: "var(--bt-border)" }}>
          {active === "wip" ? <WipTable organizationId={user.organizationId} /> : null}
          {active === "budget-variance" ? <BudgetVarianceTable organizationId={user.organizationId} /> : null}
          {active === "profitability" ? <ProfitabilityTable organizationId={user.organizationId} /> : null}
          {active === "invoicing" ? <InvoicingTable organizationId={user.organizationId} /> : null}
          {active === "labor" ? <LaborTable organizationId={user.organizationId} /> : null}
          {active === "cash-flow" ? <CashFlowTable organizationId={user.organizationId} /> : null}
          {active === "change-order-profit" ? <ChangeOrderProfitTable organizationId={user.organizationId} /> : null}
          {active === "baseline-duration" ? <BaselineDurationTable organizationId={user.organizationId} /> : null}
          {active === "daily-log-by-user" ? <DailyLogByUserTable organizationId={user.organizationId} /> : null}
          {active === "daily-log-by-job" ? <DailyLogByJobTable organizationId={user.organizationId} /> : null}
          {active === "hours-by-employee" ? <HoursByEmployeeTable organizationId={user.organizationId} /> : null}
          {active === "hours-by-job" ? <HoursByJobTable organizationId={user.organizationId} /> : null}
          {active === "lead-activities-by-salesperson" ? <LeadActivitiesBySalespersonTable organizationId={user.organizationId} /> : null}
          {active === "lead-count-by-salesperson" ? <LeadCountBySalespersonTable organizationId={user.organizationId} /> : null}
          {active === "lead-status-by-source" ? <LeadStatusBySourceTable organizationId={user.organizationId} /> : null}
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
        {rows.length === 0 ? <EmptyRow colSpan={6} /> : null}
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
        {rows.length === 0 ? <EmptyRow colSpan={5} /> : null}
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
        {rows.length === 0 ? <EmptyRow colSpan={5} /> : null}
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
        {rows.length === 0 ? <EmptyRow colSpan={6} /> : null}
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
        {rows.length === 0 ? <EmptyRow colSpan={4} /> : null}
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

async function ChangeOrderProfitTable({ organizationId }: { organizationId: string }) {
  const rows = await getChangeOrderProfitReport(organizationId);
  return (
    <table className="w-full min-w-max text-sm">
      <thead>
        <tr className="border-b text-xs font-semibold uppercase tracking-wide text-[var(--bt-muted)]" style={{ borderColor: "var(--bt-border)" }}>
          <Th>Job</Th>
          <Th right># approved</Th>
          <Th right>Builder cost</Th>
          <Th right>Client price</Th>
          <Th right>Profit</Th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.jobId} className="border-b last:border-0" style={{ borderColor: "var(--bt-border)" }}>
            <Td>{row.jobName}</Td>
            <Td right>{row.changeOrderCount}</Td>
            <Td right>{formatMoney(row.totalCostCents)}</Td>
            <Td right>{formatMoney(row.totalClientPriceCents)}</Td>
            <Td right warn={row.profitCents < 0}>{formatMoney(row.profitCents)}</Td>
          </tr>
        ))}
        {rows.length === 0 ? <EmptyRow colSpan={5} label="No approved change orders." /> : null}
      </tbody>
    </table>
  );
}

async function BaselineDurationTable({ organizationId }: { organizationId: string }) {
  const rows = await getBaselineVsActualDurationReport(organizationId);
  return (
    <table className="w-full min-w-max text-sm">
      <thead>
        <tr className="border-b text-xs font-semibold uppercase tracking-wide text-[var(--bt-muted)]" style={{ borderColor: "var(--bt-border)" }}>
          <Th>Job</Th>
          <Th right>Baseline duration</Th>
          <Th right>Actual duration</Th>
          <Th right>Variance</Th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.jobId} className="border-b last:border-0" style={{ borderColor: "var(--bt-border)" }}>
            <Td>{row.jobName}</Td>
            <Td right>{row.baselineDurationDays === null ? "No baseline snapshot" : `${row.baselineDurationDays}d`}</Td>
            <Td right>{row.actualDurationDays === null ? "Not started" : `${row.actualDurationDays}d`}</Td>
            <Td right warn={row.varianceDays !== null && row.varianceDays > 0}>
              {row.varianceDays === null ? "—" : `${row.varianceDays > 0 ? "+" : ""}${row.varianceDays}d`}
            </Td>
          </tr>
        ))}
        {rows.length === 0 ? <EmptyRow colSpan={4} /> : null}
      </tbody>
    </table>
  );
}

async function DailyLogByUserTable({ organizationId }: { organizationId: string }) {
  const rows = await getDailyLogCountByUserReport(organizationId);
  return (
    <table className="w-full min-w-max text-sm">
      <thead>
        <tr className="border-b text-xs font-semibold uppercase tracking-wide text-[var(--bt-muted)]" style={{ borderColor: "var(--bt-border)" }}>
          <Th>User</Th>
          <Th right>Daily logs</Th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.userId} className="border-b last:border-0" style={{ borderColor: "var(--bt-border)" }}>
            <Td>{row.userName}</Td>
            <Td right>{row.dailyLogCount}</Td>
          </tr>
        ))}
        {rows.length === 0 ? <EmptyRow colSpan={2} label="No daily logs yet." /> : null}
      </tbody>
    </table>
  );
}

async function DailyLogByJobTable({ organizationId }: { organizationId: string }) {
  const rows = await getDailyLogCreationByJobReport(organizationId);
  return (
    <table className="w-full min-w-max text-sm">
      <thead>
        <tr className="border-b text-xs font-semibold uppercase tracking-wide text-[var(--bt-muted)]" style={{ borderColor: "var(--bt-border)" }}>
          <Th>Job</Th>
          <Th right>Daily logs</Th>
          <Th right>Last log</Th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.jobId} className="border-b last:border-0" style={{ borderColor: "var(--bt-border)" }}>
            <Td>{row.jobName}</Td>
            <Td right warn={row.dailyLogCount === 0}>{row.dailyLogCount}</Td>
            <Td right>{row.lastLogAt ? formatDate(row.lastLogAt) : "Never"}</Td>
          </tr>
        ))}
        {rows.length === 0 ? <EmptyRow colSpan={3} /> : null}
      </tbody>
    </table>
  );
}

function formatHours(hours: number): string {
  return `${hours.toFixed(1)}h`;
}

async function HoursByEmployeeTable({ organizationId }: { organizationId: string }) {
  const rows = await getHoursWorkedByEmployeeReport(organizationId);
  return (
    <table className="w-full min-w-max text-sm">
      <thead>
        <tr className="border-b text-xs font-semibold uppercase tracking-wide text-[var(--bt-muted)]" style={{ borderColor: "var(--bt-border)" }}>
          <Th>Employee</Th>
          <Th right>Regular hours</Th>
          <Th right>Overtime hours</Th>
          <Th right>Total hours</Th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.userId} className="border-b last:border-0" style={{ borderColor: "var(--bt-border)" }}>
            <Td>{row.userName}</Td>
            <Td right>{formatHours(row.regularHours)}</Td>
            <Td right warn={row.overtimeHours > 0}>{formatHours(row.overtimeHours)}</Td>
            <Td right>{formatHours(row.totalHours)}</Td>
          </tr>
        ))}
        {rows.length === 0 ? <EmptyRow colSpan={4} label="No approved timesheets yet." /> : null}
      </tbody>
    </table>
  );
}

async function HoursByJobTable({ organizationId }: { organizationId: string }) {
  const rows = await getHoursWorkedByJobReport(organizationId);
  return (
    <table className="w-full min-w-max text-sm">
      <thead>
        <tr className="border-b text-xs font-semibold uppercase tracking-wide text-[var(--bt-muted)]" style={{ borderColor: "var(--bt-border)" }}>
          <Th>Job</Th>
          <Th right>Total hours</Th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.jobId} className="border-b last:border-0" style={{ borderColor: "var(--bt-border)" }}>
            <Td>{row.jobName}</Td>
            <Td right>{formatHours(row.totalHours)}</Td>
          </tr>
        ))}
        {rows.length === 0 ? <EmptyRow colSpan={2} /> : null}
      </tbody>
    </table>
  );
}

async function LeadActivitiesBySalespersonTable({ organizationId }: { organizationId: string }) {
  const rows = await getLeadActivitiesBySalespersonReport(organizationId);
  return (
    <table className="w-full min-w-max text-sm">
      <thead>
        <tr className="border-b text-xs font-semibold uppercase tracking-wide text-[var(--bt-muted)]" style={{ borderColor: "var(--bt-border)" }}>
          <Th>Salesperson</Th>
          <Th right>Activities</Th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.userId} className="border-b last:border-0" style={{ borderColor: "var(--bt-border)" }}>
            <Td>{row.userName}</Td>
            <Td right>{row.activityCount}</Td>
          </tr>
        ))}
        {rows.length === 0 ? <EmptyRow colSpan={2} label="No lead activities yet." /> : null}
      </tbody>
    </table>
  );
}

async function LeadCountBySalespersonTable({ organizationId }: { organizationId: string }) {
  const rows = await getLeadCountBySalespersonReport(organizationId);
  return (
    <table className="w-full min-w-max text-sm">
      <thead>
        <tr className="border-b text-xs font-semibold uppercase tracking-wide text-[var(--bt-muted)]" style={{ borderColor: "var(--bt-border)" }}>
          <Th>Salesperson</Th>
          {LEAD_STAGES.map((stage) => (
            <Th key={stage} right>
              {LEAD_STAGE_LABEL[stage]}
            </Th>
          ))}
          <Th right>Total</Th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.userId} className="border-b last:border-0" style={{ borderColor: "var(--bt-border)" }}>
            <Td>{row.userName}</Td>
            {LEAD_STAGES.map((stage) => (
              <Td key={stage} right>
                {row.counts[stage]}
              </Td>
            ))}
            <Td right>{row.total}</Td>
          </tr>
        ))}
        {rows.length === 0 ? <EmptyRow colSpan={LEAD_STAGES.length + 2} label="No leads yet." /> : null}
      </tbody>
    </table>
  );
}

async function LeadStatusBySourceTable({ organizationId }: { organizationId: string }) {
  const rows = await getLeadStatusBySourceReport(organizationId);
  return (
    <table className="w-full min-w-max text-sm">
      <thead>
        <tr className="border-b text-xs font-semibold uppercase tracking-wide text-[var(--bt-muted)]" style={{ borderColor: "var(--bt-border)" }}>
          <Th>Lead source</Th>
          {LEAD_STAGES.map((stage) => (
            <Th key={stage} right>
              {LEAD_STAGE_LABEL[stage]}
            </Th>
          ))}
          <Th right>Total</Th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.source} className="border-b last:border-0" style={{ borderColor: "var(--bt-border)" }}>
            <Td>{row.source}</Td>
            {LEAD_STAGES.map((stage) => (
              <Td key={stage} right>
                {row.counts[stage]}
              </Td>
            ))}
            <Td right>{row.total}</Td>
          </tr>
        ))}
        {rows.length === 0 ? <EmptyRow colSpan={LEAD_STAGES.length + 2} label="No leads yet." /> : null}
      </tbody>
    </table>
  );
}
