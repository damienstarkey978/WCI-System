/**
 * CRM/Sales (CLAUDE.md 2.3/3, Phase 5). A Lead is the only entity that
 * legitimately predates a Job — everything else in the system belongs to one.
 * Converting a Lead is the explicit action that materializes a real Job (in
 * PRE_SALE, exactly like a normal job creation — CLAUDE.md's "explicit
 * conversion action" pattern), so Estimates and Proposals can then be built
 * against it with zero changes to either subsystem.
 */

import { Prisma } from "@/generated/prisma/client";
import { JobStatus, type LeadActivityType, type LeadStage } from "@/generated/prisma/enums";
import type { CreateJobInput } from "@/lib/api-schemas";
import { db } from "@/lib/db";
import { emitEvent } from "@/lib/webhooks";

export class LeadNotFoundError extends Error {
  constructor(leadId: string) {
    super(`Lead ${leadId} not found`);
    this.name = "LeadNotFoundError";
  }
}

export class LeadAlreadyConvertedError extends Error {
  constructor(leadId: string) {
    super(`Lead ${leadId} has already been converted to a job.`);
    this.name = "LeadAlreadyConvertedError";
  }
}

export interface CreateLeadInput {
  readonly organizationId: string;
  readonly name: string;
  readonly email?: string | null;
  readonly phone?: string | null;
  readonly source?: string | null;
  readonly addressLine1?: string | null;
  readonly city?: string | null;
  readonly state?: string | null;
  readonly postalCode?: string | null;
  readonly notes?: string | null;
  readonly assignedUserId?: string | null;
}

export async function createLead(input: CreateLeadInput) {
  return db.lead.create({
    data: {
      organizationId: input.organizationId,
      name: input.name,
      email: input.email ?? null,
      phone: input.phone ?? null,
      source: input.source ?? null,
      addressLine1: input.addressLine1 ?? null,
      city: input.city ?? null,
      state: input.state ?? null,
      postalCode: input.postalCode ?? null,
      notes: input.notes ?? null,
      assignedUserId: input.assignedUserId ?? null,
    },
  });
}

export async function updateLeadStage(organizationId: string, leadId: string, stage: LeadStage) {
  const lead = await db.lead.findFirst({ where: { id: leadId, organizationId } });
  if (!lead) throw new LeadNotFoundError(leadId);

  return db.lead.update({ where: { id: lead.id }, data: { stage } });
}

export type ConvertLeadToJobInput = CreateJobInput;

/**
 * Convert a Lead into a real Job. Same creation shape as POST /jobs (always
 * PRE_SALE, writes the opening JobStatusEvent) — a converted lead's job is
 * not a special kind of job, just one whose lifecycle happened to start from
 * a Lead instead of a cold walk-in.
 */
export async function convertLeadToJob(
  organizationId: string,
  leadId: string,
  jobInput: ConvertLeadToJobInput,
  actorApiKeyId?: string,
) {
  const lead = await db.lead.findFirst({ where: { id: leadId, organizationId } });
  if (!lead) throw new LeadNotFoundError(leadId);
  if (lead.convertedJobId !== null) throw new LeadAlreadyConvertedError(leadId);

  const { customFields, ...rest } = jobInput;

  const result = await db.$transaction(async (tx) => {
    const job = await tx.job.create({
      data: {
        ...rest,
        organizationId,
        status: JobStatus.PRE_SALE,
        customFields: (customFields ?? {}) as Prisma.InputJsonValue,
      },
    });

    await tx.jobStatusEvent.create({
      data: {
        jobId: job.id,
        from: null,
        to: JobStatus.PRE_SALE,
        reason: `Converted from lead ${leadId}`,
        actorApiKeyId: actorApiKeyId ?? null,
      },
    });

    const updatedLead = await tx.lead.update({
      where: { id: lead.id },
      data: { convertedJobId: job.id },
    });

    return { job, lead: updatedLead };
  });

  await emitEvent(organizationId, "lead.converted", { leadId, jobId: result.job.id });

  return result;
}

export interface CreateLeadActivityInput {
  readonly organizationId: string;
  readonly leadId: string;
  readonly type: LeadActivityType;
  readonly note: string;
  readonly occurredAt?: Date;
  readonly dueDate?: Date | null;
  readonly createdByUserId?: string | null;
}

export async function createLeadActivity(input: CreateLeadActivityInput) {
  const lead = await db.lead.findFirst({ where: { id: input.leadId, organizationId: input.organizationId }, select: { id: true } });
  if (!lead) throw new LeadNotFoundError(input.leadId);

  return db.leadActivity.create({
    data: {
      organizationId: input.organizationId,
      leadId: input.leadId,
      type: input.type,
      note: input.note,
      occurredAt: input.occurredAt ?? new Date(),
      dueDate: input.dueDate ?? null,
      createdByUserId: input.createdByUserId ?? null,
    },
  });
}

export class LeadActivityNotFoundError extends Error {
  constructor(leadActivityId: string) {
    super(`Lead activity ${leadActivityId} not found`);
    this.name = "LeadActivityNotFoundError";
  }
}

/** Mark a TASK-type activity done (or reopen it, passing completed: false). Idempotent either way. */
export async function setLeadActivityCompleted(organizationId: string, leadActivityId: string, completed: boolean) {
  const activity = await db.leadActivity.findFirst({ where: { id: leadActivityId, organizationId } });
  if (!activity) throw new LeadActivityNotFoundError(leadActivityId);

  return db.leadActivity.update({
    where: { id: activity.id },
    data: { completedAt: completed ? (activity.completedAt ?? new Date()) : null },
  });
}
