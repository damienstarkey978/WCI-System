/**
 * Selections & Allowances (CLAUDE.md 2.3, Phase 3).
 *
 * An Allowance is a budget placeholder booked against a CostCode. A Selection
 * offers the client one or more priced Options against that placeholder;
 * approving one is the explicit conversion action (CLAUDE.md 2.3) that posts
 * the variance — chosen price minus allowance amount, which can be positive
 * or negative — onto the job's Budget. Nothing about a Selection touches the
 * Budget until approval, exactly like Change Orders (src/lib/change-orders).
 */

import { SelectionOptionStatus } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { acceptsNewCommitments } from "@/lib/job-status";
import type { Cents } from "@/lib/money";
import { emitEvent } from "@/lib/webhooks";

export class JobNotFoundError extends Error {
  constructor(jobId: string) {
    super(`Job ${jobId} not found`);
    this.name = "JobNotFoundError";
  }
}

export class JobNotOpenError extends Error {
  constructor(jobId: string, status: string) {
    super(`Job ${jobId} is ${status} and cannot take new selections.`);
    this.name = "JobNotOpenError";
  }
}

export class CostCodeNotFoundError extends Error {
  constructor(costCodeId: string) {
    super(`Cost code ${costCodeId} not found`);
    this.name = "CostCodeNotFoundError";
  }
}

export class AllowanceNotFoundError extends Error {
  constructor(allowanceId: string) {
    super(`Allowance ${allowanceId} not found`);
    this.name = "AllowanceNotFoundError";
  }
}

export class SelectionNotFoundError extends Error {
  constructor(selectionId: string) {
    super(`Selection ${selectionId} not found`);
    this.name = "SelectionNotFoundError";
  }
}

export class SelectionOptionNotFoundError extends Error {
  constructor(optionId: string) {
    super(`Selection option ${optionId} not found`);
    this.name = "SelectionOptionNotFoundError";
  }
}

export class SelectionAlreadyDecidedError extends Error {
  constructor(selectionId: string) {
    super(`Selection ${selectionId} already has an approved option.`);
    this.name = "SelectionAlreadyDecidedError";
  }
}

export interface CreateAllowanceInput {
  readonly organizationId: string;
  readonly jobId: string;
  readonly costCodeId: string;
  readonly title: string;
  readonly amountCents: Cents;
  readonly clientPriceCents: Cents;
}

export async function createAllowance(input: CreateAllowanceInput) {
  const [job, costCode] = await Promise.all([
    db.job.findFirst({ where: { id: input.jobId, organizationId: input.organizationId }, select: { id: true } }),
    db.costCode.findFirst({ where: { id: input.costCodeId, organizationId: input.organizationId }, select: { id: true } }),
  ]);
  if (!job) throw new JobNotFoundError(input.jobId);
  if (!costCode) throw new CostCodeNotFoundError(input.costCodeId);

  return db.allowance.create({
    data: {
      organizationId: input.organizationId,
      jobId: input.jobId,
      costCodeId: input.costCodeId,
      title: input.title,
      amountCents: input.amountCents,
      clientPriceCents: input.clientPriceCents,
    },
  });
}

export interface CreateSelectionOptionInput {
  readonly title: string;
  readonly description?: string | null;
  readonly priceCents: Cents;
  readonly clientPriceCents: Cents;
}

export interface CreateSelectionInput {
  readonly organizationId: string;
  readonly jobId: string;
  readonly allowanceId?: string | null;
  readonly title: string;
  readonly description?: string | null;
  readonly dueDate?: Date | null;
  readonly options: readonly CreateSelectionOptionInput[];
}

export async function createSelection(input: CreateSelectionInput) {
  const job = await db.job.findFirst({ where: { id: input.jobId, organizationId: input.organizationId }, select: { id: true } });
  if (!job) throw new JobNotFoundError(input.jobId);

  if (input.allowanceId) {
    const allowance = await db.allowance.findFirst({
      where: { id: input.allowanceId, organizationId: input.organizationId, jobId: input.jobId },
      select: { id: true },
    });
    if (!allowance) throw new AllowanceNotFoundError(input.allowanceId);
  }

  return db.selection.create({
    data: {
      organizationId: input.organizationId,
      jobId: input.jobId,
      allowanceId: input.allowanceId ?? null,
      title: input.title,
      description: input.description ?? null,
      dueDate: input.dueDate ?? null,
      options: {
        create: input.options.map((option, index) => ({
          title: option.title,
          description: option.description ?? null,
          priceCents: option.priceCents,
          clientPriceCents: option.clientPriceCents,
          sortOrder: index,
        })),
      },
    },
    include: { options: { orderBy: { sortOrder: "asc" } } },
  });
}

export interface ApproveSelectionOptionInput {
  readonly organizationId: string;
  readonly selectionId: string;
  readonly optionId: string;
}

/**
 * Approve one option on a Selection: marks it APPROVED, every sibling option
 * DECLINED, and — when the Selection is tied to an Allowance — posts the
 * variance (chosen price minus allowance amount, which may be negative) onto
 * the job's Budget for the Allowance's cost code. A Selection with no
 * Allowance (a cosmetic choice with no budget placeholder) just records the
 * decision.
 */
export async function approveSelectionOption(input: ApproveSelectionOptionInput) {
  const result = await db.$transaction(async (tx) => {
    const selection = await tx.selection.findFirst({
      where: { id: input.selectionId, organizationId: input.organizationId },
      include: { options: true, allowance: true },
    });
    if (!selection) throw new SelectionNotFoundError(input.selectionId);

    const job = await tx.job.findUniqueOrThrow({ where: { id: selection.jobId }, select: { status: true } });
    if (!acceptsNewCommitments(job.status)) throw new JobNotOpenError(selection.jobId, job.status);

    if (selection.options.some((option) => option.status === SelectionOptionStatus.APPROVED)) {
      throw new SelectionAlreadyDecidedError(selection.id);
    }

    const chosen = selection.options.find((option) => option.id === input.optionId);
    if (!chosen) throw new SelectionOptionNotFoundError(input.optionId);

    await tx.selectionOption.update({
      where: { id: chosen.id },
      data: { status: SelectionOptionStatus.APPROVED, decidedAt: new Date() },
    });
    await tx.selectionOption.updateMany({
      where: { selectionId: selection.id, id: { not: chosen.id } },
      data: { status: SelectionOptionStatus.DECLINED, decidedAt: new Date() },
    });

    let costDeltaCents = 0;
    let clientPriceDeltaCents = 0;

    if (selection.allowance) {
      costDeltaCents = chosen.priceCents - selection.allowance.amountCents;
      clientPriceDeltaCents = chosen.clientPriceCents - selection.allowance.clientPriceCents;

      const existing = await tx.budgetLine.findUnique({
        where: { jobId_costCodeId: { jobId: selection.jobId, costCodeId: selection.allowance.costCodeId } },
      });

      if (existing) {
        await tx.budgetLine.update({
          where: { id: existing.id },
          data: {
            revisedBudgetCostCents: existing.revisedBudgetCostCents + costDeltaCents,
            revisedClientPriceCents: existing.revisedClientPriceCents + clientPriceDeltaCents,
          },
        });
      } else {
        // Unlike ChangeOrder approval (which seeds original at zero — a CO
        // introduces scope that was never budgeted), an Allowance *is* the
        // original budgeted placeholder for this cost code. A missing
        // BudgetLine here means the estimate was never sent to budget for
        // this line, so original is the allowance amount itself, not zero.
        await tx.budgetLine.create({
          data: {
            jobId: selection.jobId,
            costCodeId: selection.allowance.costCodeId,
            originalBudgetCostCents: selection.allowance.amountCents,
            revisedBudgetCostCents: selection.allowance.amountCents + costDeltaCents,
            originalClientPriceCents: selection.allowance.clientPriceCents,
            revisedClientPriceCents: selection.allowance.clientPriceCents + clientPriceDeltaCents,
          },
        });
      }
    }

    return { jobId: selection.jobId, optionId: chosen.id, costDeltaCents, clientPriceDeltaCents };
  });

  await emitEvent(input.organizationId, "selection.option_approved", {
    selectionId: input.selectionId,
    optionId: result.optionId,
    jobId: result.jobId,
    costDeltaCents: result.costDeltaCents,
    clientPriceDeltaCents: result.clientPriceDeltaCents,
  });

  return result;
}
