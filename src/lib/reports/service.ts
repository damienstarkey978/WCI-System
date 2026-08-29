/**
 * Database wiring for the six standard reports. Reuses the same per-job funnel
 * computation the Budget module uses (src/lib/budget/funnel.ts) so every report
 * agrees with the Budget screen by construction — there is exactly one place that
 * computes projected cost, and every report reads from it.
 */

import { CostType, TimeClockApprovalStatus } from "@/generated/prisma/enums";
import { computeJobFunnel, extendedCostCents } from "@/lib/budget/funnel";
import {
  bucketCashFlowByDay,
  buildCashFlowReport,
  computeBudgetedVsProjectedRow,
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
