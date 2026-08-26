/**
 * Loads the data the commitment funnel needs and hands it to the pure computation
 * in ./funnel.ts. Keeping the database access here means the arithmetic stays
 * testable without a database.
 */

import { extendedCostCents, computeJobFunnel, type JobFunnel } from "@/lib/budget/funnel";
import { contractTypePolicy } from "@/lib/contract-type";
import { db } from "@/lib/db";

export class JobNotFoundError extends Error {
  constructor(jobId: string) {
    super(`Job ${jobId} not found`);
    this.name = "JobNotFoundError";
  }
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
  /** Cost code metadata, so a caller can render the grid without a second lookup. */
  readonly costCodes: Readonly<Record<string, { code: string; name: string }>>;
  /** Which columns this job's contract type renders (CLAUDE.md 2.3). */
  readonly columns: readonly string[];
}

/**
 * Build the full budget view for a job.
 *
 * Purchase order and bill amounts are rolled up per cost code from their line items,
 * because a single PO can span several cost codes and the funnel is computed per
 * Job × CostCode.
 */
export async function getJobBudget(jobId: string, organizationId: string): Promise<JobBudgetView> {
  const job = await db.job.findFirst({
    where: { id: jobId, organizationId },
    include: {
      budgetLines: { include: { costCode: { select: { code: true, name: true } } } },
      purchaseOrders: { include: { lineItems: true } },
      bills: { include: { lineItems: true } },
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

  const billCosts = job.bills.flatMap((bill) =>
    bill.lineItems.map((item) => ({
      costCodeId: item.costCodeId,
      approvalStatus: bill.approvalStatus,
      amountCents: item.amountCents,
    })),
  );

  const funnel = computeJobFunnel(job.budgetLines, purchaseOrderCosts, billCosts, [], {
    projectionReference: job.projectionReference,
    accountingBasis: job.accountingBasis,
  });

  const costCodes: Record<string, { code: string; name: string }> = {};
  for (const line of job.budgetLines) {
    costCodes[line.costCodeId] = { code: line.costCode.code, name: line.costCode.name };
  }

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
  };
}
