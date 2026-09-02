/**
 * "Business Advisor" (handoff.ai feature-parity pass) — the org-wide "what needs
 * attention today" digest behind the Dashboard's Daily Brief card and Jarvis's
 * get_daily_brief tool. Every figure here is a live query, same "one place computes
 * the numbers" principle as the six standard reports (src/lib/reports/service.ts) —
 * this file only adds the "which records, specifically" layer on top of them.
 */

import { db } from "@/lib/db";
import { getBudgetedVsProjectedReport } from "@/lib/reports/service";

const MS_PER_DAY = 86_400_000;

export interface OverdueInvoice {
  readonly id: string;
  readonly jobId: string;
  readonly jobName: string;
  readonly invoiceNumber: string;
  readonly amountCents: number;
  readonly dueOn: Date;
}

/** Invoices sent to a client, past their due date, not yet fully paid. */
export async function getOverdueInvoices(organizationId: string): Promise<readonly OverdueInvoice[]> {
  const invoices = await db.invoice.findMany({
    where: { organizationId, status: { in: ["SENT", "PARTIALLY_PAID"] }, dueOn: { lt: new Date() } },
    orderBy: { dueOn: "asc" },
    include: { job: { select: { id: true, name: true } } },
  });
  return invoices.map((invoice) => ({
    id: invoice.id,
    jobId: invoice.job.id,
    jobName: invoice.job.name,
    invoiceNumber: invoice.invoiceNumber,
    amountCents: invoice.amountCents,
    dueOn: invoice.dueOn!,
  }));
}

export interface OverBudgetJob {
  readonly jobId: string;
  readonly jobName: string;
  readonly varianceCents: number;
}

/** Active jobs whose projected cost has overtaken the revised budget. */
export async function getJobsOverBudget(organizationId: string): Promise<readonly OverBudgetJob[]> {
  const rows = await getBudgetedVsProjectedReport(organizationId);
  return rows
    .filter((row) => row.isOverBudget)
    .map((row) => ({ jobId: row.jobId, jobName: row.jobName, varianceCents: row.varianceCents }));
}

export interface FollowUpProposal {
  readonly id: string;
  /** Null for a proposal still against a Lead — no Job exists until it's accepted. */
  readonly jobId: string | null;
  readonly title: string;
  readonly clientName: string;
  readonly sentAt: Date;
}

/** Proposals sent to a client at least this many days ago with no response yet. */
export async function getProposalsNeedingFollowUp(organizationId: string, staleAfterDays = 5): Promise<readonly FollowUpProposal[]> {
  const cutoff = new Date(Date.now() - staleAfterDays * MS_PER_DAY);
  const proposals = await db.proposal.findMany({
    where: { organizationId, status: "SENT", sentAt: { lte: cutoff } },
    orderBy: { sentAt: "asc" },
    include: { client: { select: { name: true } } },
  });
  return proposals.map((proposal) => ({
    id: proposal.id,
    jobId: proposal.jobId,
    title: proposal.title,
    clientName: proposal.client.name,
    sentAt: proposal.sentAt!,
  }));
}

export interface BillableMilestone {
  readonly drawId: string;
  readonly jobId: string;
  readonly jobName: string;
  readonly title: string;
}

/** Draws whose trigger date has passed but no invoice has been generated for them yet. */
export async function getBillableMilestones(organizationId: string): Promise<readonly BillableMilestone[]> {
  const draws = await db.draw.findMany({
    where: {
      invoice: null,
      autoGeneratesInvoiceOnDate: { lte: new Date() },
      drawSchedule: { job: { organizationId, status: { in: ["PRE_SALE", "OPEN"] } } },
    },
    orderBy: { autoGeneratesInvoiceOnDate: "asc" },
    include: { drawSchedule: { include: { job: { select: { id: true, name: true } } } } },
  });
  return draws.map((draw) => ({
    drawId: draw.id,
    jobId: draw.drawSchedule.job.id,
    jobName: draw.drawSchedule.job.name,
    title: draw.title,
  }));
}

export interface CostInboxItem {
  readonly billId: string;
  readonly jobId: string;
  readonly jobName: string;
  readonly vendorLabel: string;
  readonly amountCents: number;
}

/** AI-scanned bills still awaiting a human's approve/reject before they hit the budget. */
export async function getCostInboxItems(organizationId: string): Promise<readonly CostInboxItem[]> {
  const bills = await db.bill.findMany({
    where: { organizationId, fromOcr: true, approvalStatus: "IN_REVIEW" },
    orderBy: { createdAt: "desc" },
    include: { job: { select: { id: true, name: true } }, lineItems: { select: { amountCents: true } } },
  });
  return bills.map((bill) => ({
    billId: bill.id,
    jobId: bill.job.id,
    jobName: bill.job.name,
    vendorLabel: bill.vendorName,
    amountCents: bill.lineItems.reduce((total, item) => total + item.amountCents, 0),
  }));
}

export interface DailyBrief {
  readonly overdueInvoices: readonly OverdueInvoice[];
  readonly overdueInvoiceTotalCents: number;
  readonly jobsOverBudget: readonly OverBudgetJob[];
  readonly unapprovedShiftCount: number;
  readonly pendingChangeOrderCount: number;
  readonly proposalsNeedingFollowUp: readonly FollowUpProposal[];
  readonly billableMilestones: readonly BillableMilestone[];
  readonly costInboxItems: readonly CostInboxItem[];
}

/** Everything on the digest, fetched in parallel — the single source both the
 *  Dashboard's Daily Brief card and Jarvis's get_daily_brief tool read from. */
export async function getDailyBrief(organizationId: string): Promise<DailyBrief> {
  const [overdueInvoices, jobsOverBudget, unapprovedShiftCount, pendingChangeOrderCount, proposalsNeedingFollowUp, billableMilestones, costInboxItems] =
    await Promise.all([
      getOverdueInvoices(organizationId),
      getJobsOverBudget(organizationId),
      db.timeClockEntry.count({ where: { organizationId, approvalStatus: "PENDING" } }),
      db.changeOrder.count({ where: { organizationId, status: "PENDING_APPROVAL" } }),
      getProposalsNeedingFollowUp(organizationId),
      getBillableMilestones(organizationId),
      getCostInboxItems(organizationId),
    ]);

  return {
    overdueInvoices,
    overdueInvoiceTotalCents: overdueInvoices.reduce((total, invoice) => total + invoice.amountCents, 0),
    jobsOverBudget,
    unapprovedShiftCount,
    pendingChangeOrderCount,
    proposalsNeedingFollowUp,
    billableMilestones,
    costInboxItems,
  };
}
