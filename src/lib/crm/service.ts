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

export class ClientNotFoundForLeadError extends Error {
  constructor(clientId: string) {
    super(`Client ${clientId} not found`);
    this.name = "ClientNotFoundForLeadError";
  }
}

export interface CreateLeadInput {
  readonly organizationId: string;
  /** The opportunity's own free-text label — distinct from the contact's name. */
  readonly title?: string | null;
  readonly name: string;
  readonly email?: string | null;
  readonly phone?: string | null;
  /** Set when the contact was picked via "Choose from existing contacts" rather
   *  than typed fresh — name/email/phone above should already match that Client's. */
  readonly contactClientId?: string | null;
  readonly source?: string | null;
  readonly addressLine1?: string | null;
  readonly city?: string | null;
  readonly state?: string | null;
  readonly postalCode?: string | null;
  readonly notes?: string | null;
  readonly assignedUserId?: string | null;
  readonly confidencePercent?: number;
  readonly projectedSalesDate?: Date | null;
  readonly estimatedRevenueMinCents?: number | null;
  readonly estimatedRevenueMaxCents?: number | null;
  readonly projectType?: string | null;
  readonly tags?: readonly string[];
}

export async function createLead(input: CreateLeadInput) {
  if (input.contactClientId) {
    const client = await db.client.findFirst({ where: { id: input.contactClientId, organizationId: input.organizationId }, select: { id: true } });
    if (!client) throw new ClientNotFoundForLeadError(input.contactClientId);
  }

  return db.lead.create({
    data: {
      organizationId: input.organizationId,
      title: input.title ?? null,
      name: input.name,
      email: input.email ?? null,
      phone: input.phone ?? null,
      contactClientId: input.contactClientId ?? null,
      source: input.source ?? null,
      addressLine1: input.addressLine1 ?? null,
      city: input.city ?? null,
      state: input.state ?? null,
      postalCode: input.postalCode ?? null,
      notes: input.notes ?? null,
      assignedUserId: input.assignedUserId ?? null,
      confidencePercent: input.confidencePercent ?? 0,
      projectedSalesDate: input.projectedSalesDate ?? null,
      estimatedRevenueMinCents: input.estimatedRevenueMinCents ?? null,
      estimatedRevenueMaxCents: input.estimatedRevenueMaxCents ?? null,
      projectType: input.projectType ?? null,
      tags: input.tags ? [...input.tags] : [],
    },
  });
}

export async function updateLeadStage(organizationId: string, leadId: string, stage: LeadStage) {
  const lead = await db.lead.findFirst({ where: { id: leadId, organizationId } });
  if (!lead) throw new LeadNotFoundError(leadId);

  return db.lead.update({ where: { id: lead.id }, data: { stage } });
}

export interface UpdateLeadDetailsInput {
  readonly title?: string | null;
  readonly confidencePercent?: number;
  readonly projectedSalesDate?: Date | null;
  readonly estimatedRevenueMinCents?: number | null;
  readonly estimatedRevenueMaxCents?: number | null;
  readonly projectType?: string | null;
  readonly tags?: readonly string[];
}

/** Updates the Buildertrend-parity opportunity fields (title, confidence, revenue
 *  range, projected date, project type, tags) — the linked contact's own
 *  name/email/phone/contactClientId stay set at creation, same as before this. */
export async function updateLeadDetails(organizationId: string, leadId: string, input: UpdateLeadDetailsInput) {
  const lead = await db.lead.findFirst({ where: { id: leadId, organizationId } });
  if (!lead) throw new LeadNotFoundError(leadId);

  return db.lead.update({
    where: { id: lead.id },
    data: {
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.confidencePercent !== undefined ? { confidencePercent: input.confidencePercent } : {}),
      ...(input.projectedSalesDate !== undefined ? { projectedSalesDate: input.projectedSalesDate } : {}),
      ...(input.estimatedRevenueMinCents !== undefined ? { estimatedRevenueMinCents: input.estimatedRevenueMinCents } : {}),
      ...(input.estimatedRevenueMaxCents !== undefined ? { estimatedRevenueMaxCents: input.estimatedRevenueMaxCents } : {}),
      ...(input.projectType !== undefined ? { projectType: input.projectType } : {}),
      ...(input.tags !== undefined ? { tags: [...input.tags] } : {}),
    },
  });
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
