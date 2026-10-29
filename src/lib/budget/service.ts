/**
 * Loads the data the commitment funnel needs and hands it to the pure computation
 * in ./funnel.ts. Keeping the database access here means the arithmetic stays
 * testable without a database.
 */

import { TimeClockApprovalStatus } from "@/generated/prisma/enums";
import { rollUpByCostType, type CostTypeTotals } from "@/lib/budget/cost-types";
import { contractRevenueOnly, extendedCostCents, computeJobFunnel, type JobFunnel } from "@/lib/budget/funnel";
import type { CostCodeLookupEntry } from "@/lib/budget/grouping";
import { contractTypePolicy } from "@/lib/contract-type";
import { db } from "@/lib/db";
import { baseLaborCostCents, workedHours } from "@/lib/time-clock/hours";

export class JobNotFoundError extends Error {
  constructor(jobId: string) {
    super(`Job ${jobId} not found`);
    this.name = "JobNotFoundError";
  }
}

/** The locked estimate that last populated this job's BudgetLines, when one exists. */
export interface BudgetSourceEstimate {
  readonly id: string;
  readonly title: string;
  readonly sentToBudgetAt: string;
}

export interface JobBudgetView {
  readonly job: {
    readonly id: string;
    readonly name: string;
    readonly contractType: string;
    readonly status: string;
    readonly projectionReference: string;
    readonly accountingBasis: string;
  };
  readonly funnel: JobFunnel;
  /**
   * Cost code metadata, so a caller can render the grid without a second lookup.
   * `group` is the cost code's parent, which the job costing screen groups by.
   */
  readonly costCodes: Readonly<Record<string, CostCodeLookupEntry>>;
  /** Which columns this job's contract type renders (CLAUDE.md 2.3). */
  readonly columns: readonly string[];
  /**
   * Labor / Materials / … rollups of the same funnel lines. Bills feed
   * `actualCostCents` here the same way they feed the per-line grid — no
   * parallel accounting path.
   */
  readonly costTypeTotals: readonly CostTypeTotals[];
  /** Most recent locked estimate that wrote BudgetLines, or null if none. */
  readonly sourceEstimate: BudgetSourceEstimate | null;
}

/**
 * Build the full budget view for a job.
 *
 * Purchase order and bill amounts are rolled up per cost code from their line items,
 * because a single PO can span several cost codes and the funnel is computed per
 * Job × CostCode.
 */
export async function getJobBudget(jobId: string, organizationId: string): Promise<JobBudgetView> {
  // Select only the columns the funnel math needs — a full include of every PO /
  // bill / timesheet row was shipping notes, signatures, OCR blobs, and unused
  // relation fields into memory on every Budget page load.
  const job = await db.job.findFirst({
    where: { id: jobId, organizationId },
    select: {
      id: true,
      name: true,
      contractType: true,
      status: true,
      projectionReference: true,
      accountingBasis: true,
      budgetLines: {
        select: {
          costCodeId: true,
          originalBudgetCostCents: true,
          revisedBudgetCostCents: true,
          originalClientPriceCents: true,
          revisedClientPriceCents: true,
          rateMode: true,
          rateBasisPoints: true,
          costCode: {
            select: {
              code: true,
              name: true,
              defaultCostType: true,
              parent: { select: { id: true, code: true, name: true } },
            },
          },
        },
      },
      purchaseOrders: {
        select: {
          status: true,
          lineItems: { select: { costCodeId: true, quantityMilli: true, unitCostCents: true } },
        },
      },
      bills: {
        select: {
          approvalStatus: true,
          lineItems: { select: { costCodeId: true, amountCents: true } },
        },
      },
      invoices: { select: { status: true, amountCents: true, taxCents: true } },
      timeClockEntries: {
        where: { approvalStatus: TimeClockApprovalStatus.APPROVED, clockOutAt: { not: null } },
        select: {
          costCodeId: true,
          clockInAt: true,
          clockOutAt: true,
          hourlyRateCents: true,
          breaks: { select: { startAt: true, endAt: true } },
        },
      },
      estimates: {
        where: { sentToBudgetAt: { not: null } },
        orderBy: { sentToBudgetAt: "desc" },
        take: 1,
        select: { id: true, title: true, sentToBudgetAt: true },
      },
    },
  });

  if (!job) {
    throw new JobNotFoundError(jobId);
  }

  const purchaseOrderCosts = job.purchaseOrders.flatMap((po) =>
    po.lineItems.map((item) => ({
      costCodeId: item.costCodeId,
      status: po.status,
      amountCents: extendedCostCents(item.quantityMilli, item.unitCostCents),
    })),
  );

  // Bills drive actualCost in the funnel. Accrual counts every non-VOID/non-INBOX
  // bill; cash counts PAID only (see funnel.countsAsActual). A new/approved/paid
  // bill updates this view on the next read — nothing is stored on BudgetLine.
  const billCosts = job.bills.flatMap((bill) =>
    bill.lineItems.map((item) => ({
      costCodeId: item.costCodeId,
      approvalStatus: bill.approvalStatus,
      amountCents: item.amountCents,
    })),
  );

  // Approved timesheets count as committed cost — the money is owed once a
  // supervisor has signed off on the hours, whether or not payroll has run yet
  // (CLAUDE.md 2.3: committedCost = approved POs + unapproved labor). This is base
  // hours x base rate only; the overtime premium is a payroll-reporting concern
  // computed separately in src/lib/time-clock/overtime.ts, not mixed into per-job
  // cost attribution — see the comment in src/lib/time-clock/hours.ts for why.
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
    contractRevenueOnly(job.invoices),
  );

  const costCodes: Record<string, CostCodeLookupEntry> = {};
  for (const line of job.budgetLines) {
    costCodes[line.costCodeId] = {
      code: line.costCode.code,
      name: line.costCode.name,
      group: line.costCode.parent,
      defaultCostType: line.costCode.defaultCostType,
    };
  }

  // The funnel now includes cost codes that have spend but no budget line, so their
  // names have to be looked up too — otherwise those rows render blank on a screen
  // whose whole purpose is telling someone where the money went.
  const unnamed = funnel.lines.map((line) => line.costCodeId).filter((id) => !costCodes[id]);
  if (unnamed.length > 0) {
    const extra = await db.costCode.findMany({
      where: { id: { in: unnamed }, organizationId },
      select: {
        id: true,
        code: true,
        name: true,
        defaultCostType: true,
        parent: { select: { id: true, code: true, name: true } },
      },
    });
    for (const costCode of extra) {
      costCodes[costCode.id] = {
        code: costCode.code,
        name: costCode.name,
        group: costCode.parent,
        defaultCostType: costCode.defaultCostType,
      };
    }
  }

  const source = job.estimates[0] ?? null;

  return {
    job: {
      id: job.id,
      name: job.name,
      contractType: job.contractType,
      status: job.status,
      projectionReference: job.projectionReference,
      accountingBasis: job.accountingBasis,
    },
    funnel,
    costCodes,
    columns: contractTypePolicy(job.contractType).budgetColumns(),
    costTypeTotals: rollUpByCostType(funnel.lines, costCodes),
    sourceEstimate: source
      ? {
          id: source.id,
          title: source.title,
          sentToBudgetAt: source.sentToBudgetAt!.toISOString(),
        }
      : null,
  };
}
