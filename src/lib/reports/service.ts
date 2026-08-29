/**
 * Database wiring for the six standard reports. Reuses the same per-job funnel
 * computation the Budget module uses (src/lib/budget/funnel.ts) so every report
 * agrees with the Budget screen by construction — there is exactly one place that
 * computes projected cost, and every report reads from it.
 */

import { ChangeOrderMode, ChangeOrderStatus, CostType, LeadStage, TimeClockApprovalStatus } from "@/generated/prisma/enums";
import { computeJobFunnel, extendedCostCents } from "@/lib/budget/funnel";
import { rollUpEstimateLines } from "@/lib/budget/send-to-budget";
import {
  bucketCashFlowByDay,
  buildCashFlowReport,
  computeBudgetedVsProjectedRow,
  computeChangeOrderProfitRow,
  computeDurationRow,
  computeInvoicingRow,
  computeLaborRow,
  computeProfitabilityRow,
  computeWipRow,
  sortByMarginAscending,
  type CashEvent,
} from "@/lib/reports/calc";
import { db } from "@/lib/db";
import { ACTIVE_JOB_STATUSES } from "@/lib/job-status";
import { baseLaborCostCents, workedHours } from "@/lib/time-clock/hours";
import { computeWeeklyOvertime, type DailyHours } from "@/lib/time-clock/overtime";

/**
 * Load every active job's funnel in one pass. Every report below is a
 * transformation over this shared array, so a job appears identically across
 * reports — no report can silently disagree with another about a job's numbers.
 */
async function loadActiveJobFunnels(organizationId: string, jobGroupId?: string) {
  const jobs = await db.job.findMany({
    where: { organizationId, isTemplate: false, status: { in: [...ACTIVE_JOB_STATUSES] }, ...(jobGroupId ? { jobGroupId } : {}) },
    include: {
      budgetLines: { include: { costCode: { select: { defaultCostType: true } } } },
      purchaseOrders: { include: { lineItems: true } },
      bills: { include: { lineItems: true } },
      invoices: { select: { status: true, amountCents: true } },
      timeClockEntries: {
        where: { approvalStatus: TimeClockApprovalStatus.APPROVED, clockOutAt: { not: null } },
        include: { breaks: true },
      },
    },
  });

  return jobs.map((job) => {
    const purchaseOrderCosts = job.purchaseOrders.flatMap((po) =>
      po.lineItems.map((item) => ({
        costCodeId: item.costCodeId,
        status: po.status,
        amountCents: extendedCostCents(item.quantityMilli, item.unitCostCents),
      })),
    );
    const billCosts = job.bills.flatMap((bill) =>
      bill.lineItems.map((item) => ({
        costCodeId: item.costCodeId,
        approvalStatus: bill.approvalStatus,
        amountCents: item.amountCents,
      })),
    );
    const unapprovedLabor = job.timeClockEntries.map((entry) => ({
      costCodeId: entry.costCodeId,
      amountCents: baseLaborCostCents(workedHours(entry.clockInAt, entry.clockOutAt, entry.breaks), entry.hourlyRateCents),
    }));

    const funnel = computeJobFunnel(
      job.budgetLines,
      purchaseOrderCosts,
      billCosts,
      unapprovedLabor,
      { projectionReference: job.projectionReference, accountingBasis: job.accountingBasis },
      job.invoices,
    );

    const budgetedLaborCostCents = job.budgetLines
      .filter((line) => line.costCode.defaultCostType === CostType.LABOR)
      .reduce((total, line) => total + line.revisedBudgetCostCents, 0);

    const approvedLaborCostCents = unapprovedLabor.reduce((total, entry) => total + entry.amountCents, 0);

    return { job, funnel, budgetedLaborCostCents, approvedLaborCostCents };
  });
}

export async function getWipReport(organizationId: string, jobGroupId?: string) {
  const jobFunnels = await loadActiveJobFunnels(organizationId, jobGroupId);
  return jobFunnels.map(({ job, funnel }) =>
    computeWipRow({
      jobId: job.id,
      jobName: job.name,
      revisedClientPriceCents: funnel.totals.revisedClientPriceCents,
      actualCostCents: funnel.totals.actualCostCents,
      projectedCostCents: funnel.totals.projectedCostCents,
      amountInvoicedCents: funnel.totals.amountInvoicedCents,
    }),
  );
}

export async function getBudgetedVsProjectedReport(organizationId: string) {
  const jobFunnels = await loadActiveJobFunnels(organizationId);
  return jobFunnels.map(({ job, funnel }) =>
    computeBudgetedVsProjectedRow({
      jobId: job.id,
      jobName: job.name,
      originalBudgetCostCents: funnel.totals.originalBudgetCostCents,
      revisedBudgetCostCents: funnel.totals.revisedBudgetCostCents,
      projectedCostCents: funnel.totals.projectedCostCents,
    }),
  );
}

export async function getProfitabilityReport(organizationId: string, jobGroupId?: string) {
  const jobFunnels = await loadActiveJobFunnels(organizationId, jobGroupId);
  const rows = jobFunnels.map(({ job, funnel }) =>
    computeProfitabilityRow({
      jobId: job.id,
      jobName: job.name,
      revisedClientPriceCents: funnel.totals.revisedClientPriceCents,
      projectedCostCents: funnel.totals.projectedCostCents,
    }),
  );
  return sortByMarginAscending(rows);
}

export async function getInvoicingReport(organizationId: string) {
  const jobFunnels = await loadActiveJobFunnels(organizationId);

  const jobIds = jobFunnels.map(({ job }) => job.id);
  const payments = await db.payment.findMany({
    where: { organizationId, invoice: { jobId: { in: jobIds } } },
    select: { amountCents: true, invoice: { select: { jobId: true } } },
  });
  const paidByJob = new Map<string, number>();
  for (const payment of payments) {
    paidByJob.set(payment.invoice.jobId, (paidByJob.get(payment.invoice.jobId) ?? 0) + payment.amountCents);
  }

  return jobFunnels.map(({ job, funnel }) =>
    computeInvoicingRow({
      jobId: job.id,
      jobName: job.name,
      revisedClientPriceCents: funnel.totals.revisedClientPriceCents,
      amountInvoicedCents: funnel.totals.amountInvoicedCents,
      remainingToInvoiceCents: funnel.totals.remainingToInvoiceCents,
      totalPaidCents: paidByJob.get(job.id) ?? 0,
    }),
  );
}

export async function getLaborReport(organizationId: string) {
  const jobFunnels = await loadActiveJobFunnels(organizationId);
  return jobFunnels.map(({ job, budgetedLaborCostCents, approvedLaborCostCents }) =>
    computeLaborRow({ jobId: job.id, jobName: job.name, budgetedLaborCostCents, approvedLaborCostCents }),
  );
}

export interface CashFlowReportOptions {
  readonly windowDays?: number;
}

export async function getCashFlowReport(organizationId: string, options: CashFlowReportOptions = {}) {
  const windowDays = options.windowDays ?? 30;
  const windowStart = new Date(Date.now() - (windowDays - 1) * 86_400_000);
  const windowStartDate = windowStart.toISOString().slice(0, 10);

  const [payments, paidBills, jobFunnels] = await Promise.all([
    db.payment.findMany({
      where: { organizationId, receivedAt: { gte: windowStart } },
      select: { amountCents: true, receivedAt: true },
    }),
    db.bill.findMany({
      where: { organizationId, paidAt: { gte: windowStart } },
      include: { lineItems: { select: { amountCents: true } } },
    }),
    loadActiveJobFunnels(organizationId),
  ]);

  const cashIn: CashEvent[] = payments.map((payment) => ({
    date: payment.receivedAt.toISOString().slice(0, 10),
    amountCents: payment.amountCents,
  }));

  const cashOut: CashEvent[] = paidBills.map((bill) => ({
    date: bill.paidAt!.toISOString().slice(0, 10),
    amountCents: bill.lineItems.reduce((total, item) => total + item.amountCents, 0),
  }));

  const historical = bucketCashFlowByDay(windowStartDate, windowDays, cashIn, cashOut);

  const projectedCashInCents = jobFunnels.reduce(
    (total, { funnel }) => total + funnel.totals.remainingToInvoiceCents,
    0,
  );
  const projectedCashOutCents = jobFunnels.reduce(
    (total, { funnel }) => total + funnel.totals.costToCompleteCents,
    0,
  );

  return buildCashFlowReport(historical, { projectedCashInCents, projectedCashOutCents });
}

/** Active jobs' id/name — the shared job list for reports below that don't need the full funnel. */
async function loadActiveJobSummaries(organizationId: string) {
  return db.job.findMany({
    where: { organizationId, isTemplate: false, status: { in: [...ACTIVE_JOB_STATUSES] } },
    select: { id: true, name: true },
  });
}

/**
 * A change order's own cost/price — FLAT mode uses its entered deltas directly;
 * ITEMIZED reuses rollUpEstimateLines (src/lib/budget/send-to-budget.ts), the same
 * "price each line then sum" function change-orders/service.ts uses when a change
 * order is actually approved into the Budget.
 */
function changeOrderTotals(changeOrder: {
  mode: ChangeOrderMode;
  flatCostCents: number | null;
  flatClientPriceCents: number | null;
  lineItems: readonly { costCodeId: string; quantityMilli: number; unitCostCents: number; rateMode: import("@/generated/prisma/enums").RateMode; rateBasisPoints: number }[];
}): { costCents: number; clientPriceCents: number } {
  if (changeOrder.mode === ChangeOrderMode.FLAT) {
    return { costCents: changeOrder.flatCostCents ?? 0, clientPriceCents: changeOrder.flatClientPriceCents ?? 0 };
  }
  const rollup = rollUpEstimateLines(changeOrder.lineItems);
  return rollup.reduce(
    (totals, line) => ({ costCents: totals.costCents + line.costCents, clientPriceCents: totals.clientPriceCents + line.clientPriceCents }),
    { costCents: 0, clientPriceCents: 0 },
  );
}

/** Buildertrend's "Change Order Profit" report: builder cost vs. client price vs. profit, per job, across every APPROVED change order. */
export async function getChangeOrderProfitReport(organizationId: string) {
  const jobs = await loadActiveJobSummaries(organizationId);
  const changeOrders = await db.changeOrder.findMany({
    where: { organizationId, status: ChangeOrderStatus.APPROVED, jobId: { in: jobs.map((job) => job.id) } },
    select: { jobId: true, mode: true, flatCostCents: true, flatClientPriceCents: true, lineItems: true },
  });

  const byJob = new Map<string, { count: number; costCents: number; clientPriceCents: number }>();
  for (const changeOrder of changeOrders) {
    const totals = changeOrderTotals(changeOrder);
    const existing = byJob.get(changeOrder.jobId) ?? { count: 0, costCents: 0, clientPriceCents: 0 };
    byJob.set(changeOrder.jobId, {
      count: existing.count + 1,
      costCents: existing.costCents + totals.costCents,
      clientPriceCents: existing.clientPriceCents + totals.clientPriceCents,
    });
  }

  return jobs
    .filter((job) => byJob.has(job.id))
    .map((job) => {
      const totals = byJob.get(job.id)!;
      return computeChangeOrderProfitRow({
        jobId: job.id,
        jobName: job.name,
        changeOrderCount: totals.count,
        totalCostCents: totals.costCents,
        totalClientPriceCents: totals.clientPriceCents,
      });
    });
}

/** Buildertrend's "Baseline vs. actual duration by job" report — schedule baseline snapshots vs. real start/end dates. */
export async function getBaselineVsActualDurationReport(organizationId: string) {
  const jobs = await db.job.findMany({
    where: { organizationId, isTemplate: false, status: { in: [...ACTIVE_JOB_STATUSES] } },
    select: {
      id: true,
      name: true,
      actualStart: true,
      actualEnd: true,
      schedules: { select: { items: { select: { baselineStart: true, baselineEnd: true } } } },
    },
  });

  const now = new Date();
  return jobs.map((job) => {
    const baselineStarts: Date[] = [];
    const baselineEnds: Date[] = [];
    for (const schedule of job.schedules) {
      for (const item of schedule.items) {
        if (item.baselineStart) baselineStarts.push(item.baselineStart);
        if (item.baselineEnd) baselineEnds.push(item.baselineEnd);
      }
    }
    const baselineStart = baselineStarts.length > 0 ? new Date(Math.min(...baselineStarts.map((d) => d.getTime()))) : null;
    const baselineEnd = baselineEnds.length > 0 ? new Date(Math.max(...baselineEnds.map((d) => d.getTime()))) : null;

    return computeDurationRow({
      jobId: job.id,
      jobName: job.name,
      baselineStart,
      baselineEnd,
      actualStart: job.actualStart,
      actualEnd: job.actualEnd,
      asOf: now,
    });
  });
}

/** Buildertrend's "Daily Log count by user" report. */
export async function getDailyLogCountByUserReport(organizationId: string) {
  const logs = await db.dailyLog.findMany({
    where: { organizationId },
    select: { authorUserId: true, authorUser: { select: { name: true, email: true } } },
  });

  const byUser = new Map<string, { name: string; count: number }>();
  for (const log of logs) {
    const existing = byUser.get(log.authorUserId);
    byUser.set(log.authorUserId, { name: log.authorUser.name ?? log.authorUser.email, count: (existing?.count ?? 0) + 1 });
  }

  return Array.from(byUser.entries())
    .map(([userId, { name, count }]) => ({ userId, userName: name, dailyLogCount: count }))
    .sort((a, b) => b.dailyLogCount - a.dailyLogCount);
}

/** Buildertrend's "Daily Log creation by job" report — flags jobs that haven't had a recent entry. */
export async function getDailyLogCreationByJobReport(organizationId: string) {
  const jobs = await loadActiveJobSummaries(organizationId);
  const logs = await db.dailyLog.findMany({
    where: { organizationId, jobId: { in: jobs.map((job) => job.id) } },
    select: { jobId: true, createdAt: true },
  });

  const byJob = new Map<string, { count: number; lastLogAt: Date | null }>();
  for (const log of logs) {
    const existing = byJob.get(log.jobId) ?? { count: 0, lastLogAt: null };
    byJob.set(log.jobId, {
      count: existing.count + 1,
      lastLogAt: existing.lastLogAt === null || log.createdAt > existing.lastLogAt ? log.createdAt : existing.lastLogAt,
    });
  }

  return jobs
    .map((job) => ({ jobId: job.id, jobName: job.name, ...(byJob.get(job.id) ?? { count: 0, lastLogAt: null }) }))
    .map((row) => ({ jobId: row.jobId, jobName: row.jobName, dailyLogCount: row.count, lastLogAt: row.lastLogAt }));
}

/** Approved, completed time-clock entries against active jobs, bucketed by ISO week per worker — the shared basis for both hours-worked reports. */
async function loadApprovedTimeClockEntries(organizationId: string) {
  const jobs = await loadActiveJobSummaries(organizationId);
  return db.timeClockEntry.findMany({
    where: {
      organizationId,
      jobId: { in: jobs.map((job) => job.id) },
      approvalStatus: TimeClockApprovalStatus.APPROVED,
      clockOutAt: { not: null },
    },
    select: { userId: true, jobId: true, clockInAt: true, clockOutAt: true, breaks: true, user: { select: { name: true, email: true } } },
  });
}

/** Monday of the ISO week containing `date`, as a yyyy-mm-dd string. */
function isoWeekStart(date: Date): string {
  const day = date.getUTCDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const monday = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + diffToMonday));
  return monday.toISOString().slice(0, 10);
}

/** Buildertrend's "Hours worked, by employee" report — regular vs. overtime, using the same weekly OT rule as payroll (src/lib/time-clock/overtime.ts). */
export async function getHoursWorkedByEmployeeReport(organizationId: string) {
  const entries = await loadApprovedTimeClockEntries(organizationId);

  const byUser = new Map<string, { name: string; byWeek: Map<string, number> }>();
  for (const entry of entries) {
    const hours = workedHours(entry.clockInAt, entry.clockOutAt, entry.breaks);
    const week = isoWeekStart(entry.clockInAt);
    const bucket = byUser.get(entry.userId) ?? { name: entry.user.name ?? entry.user.email, byWeek: new Map<string, number>() };
    bucket.byWeek.set(week, (bucket.byWeek.get(week) ?? 0) + hours);
    byUser.set(entry.userId, bucket);
  }

  return Array.from(byUser.entries())
    .map(([userId, { name, byWeek }]) => {
      const dailyHours: DailyHours[] = Array.from(byWeek.entries()).map(([date, hours]) => ({ date, hours }));
      const totals = dailyHours.reduce(
        (sum, week) => {
          const { regularHours, overtimeHours } = computeWeeklyOvertime([week]);
          return { regularHours: sum.regularHours + regularHours, overtimeHours: sum.overtimeHours + overtimeHours };
        },
        { regularHours: 0, overtimeHours: 0 },
      );
      return { userId, userName: name, regularHours: totals.regularHours, overtimeHours: totals.overtimeHours, totalHours: totals.regularHours + totals.overtimeHours };
    })
    .sort((a, b) => b.totalHours - a.totalHours);
}

/** Buildertrend's "Hours worked, by job" report. Total hours only — overtime is a property of a worker's whole week, not attributable to one job. */
export async function getHoursWorkedByJobReport(organizationId: string) {
  const jobs = await loadActiveJobSummaries(organizationId);
  const entries = await loadApprovedTimeClockEntries(organizationId);

  const byJob = new Map<string, number>();
  for (const entry of entries) {
    const hours = workedHours(entry.clockInAt, entry.clockOutAt, entry.breaks);
    byJob.set(entry.jobId, (byJob.get(entry.jobId) ?? 0) + hours);
  }

  return jobs.map((job) => ({ jobId: job.id, jobName: job.name, totalHours: byJob.get(job.id) ?? 0 }));
}

const SALESPERSON_UNASSIGNED = "Unassigned";

/** Buildertrend's "Lead activities by salesperson" report. */
export async function getLeadActivitiesBySalespersonReport(organizationId: string) {
  const activities = await db.leadActivity.findMany({
    where: { organizationId },
    select: { lead: { select: { assignedUser: { select: { id: true, name: true, email: true } } } } },
  });

  const byPerson = new Map<string, { name: string; count: number }>();
  for (const activity of activities) {
    const assignee = activity.lead.assignedUser;
    const key = assignee?.id ?? SALESPERSON_UNASSIGNED;
    const name = assignee ? (assignee.name ?? assignee.email) : SALESPERSON_UNASSIGNED;
    const existing = byPerson.get(key);
    byPerson.set(key, { name, count: (existing?.count ?? 0) + 1 });
  }

  return Array.from(byPerson.entries())
    .map(([userId, { name, count }]) => ({ userId, userName: name, activityCount: count }))
    .sort((a, b) => b.activityCount - a.activityCount);
}

const LEAD_STAGES = Object.values(LeadStage);

export interface LeadStageBreakdown {
  readonly counts: Readonly<Record<LeadStage, number>>;
  readonly total: number;
}

function emptyStageBreakdown(): Record<LeadStage, number> {
  return Object.fromEntries(LEAD_STAGES.map((stage) => [stage, 0])) as Record<LeadStage, number>;
}

/** Buildertrend's "Lead count by salesperson" report — one row per salesperson, one column per stage. */
export async function getLeadCountBySalespersonReport(organizationId: string) {
  const leads = await db.lead.findMany({
    where: { organizationId },
    select: { stage: true, assignedUser: { select: { id: true, name: true, email: true } } },
  });

  const byPerson = new Map<string, { name: string; counts: Record<LeadStage, number>; total: number }>();
  for (const lead of leads) {
    const assignee = lead.assignedUser;
    const key = assignee?.id ?? SALESPERSON_UNASSIGNED;
    const name = assignee ? (assignee.name ?? assignee.email) : SALESPERSON_UNASSIGNED;
    const existing = byPerson.get(key) ?? { name, counts: emptyStageBreakdown(), total: 0 };
    existing.counts[lead.stage] += 1;
    existing.total += 1;
    byPerson.set(key, existing);
  }

  return Array.from(byPerson.entries())
    .map(([userId, row]) => ({ userId, userName: row.name, counts: row.counts, total: row.total }))
    .sort((a, b) => b.total - a.total);
}

/** Buildertrend's "Lead status by source" report — one row per source, one column per stage. */
export async function getLeadStatusBySourceReport(organizationId: string) {
  const leads = await db.lead.findMany({ where: { organizationId }, select: { stage: true, source: true } });

  const bySource = new Map<string, { counts: Record<LeadStage, number>; total: number }>();
  for (const lead of leads) {
    const source = lead.source?.trim() || "Unknown";
    const existing = bySource.get(source) ?? { counts: emptyStageBreakdown(), total: 0 };
    existing.counts[lead.stage] += 1;
    existing.total += 1;
    bySource.set(source, existing);
  }

  return Array.from(bySource.entries())
    .map(([source, row]) => ({ source, counts: row.counts, total: row.total }))
    .sort((a, b) => b.total - a.total);
}
