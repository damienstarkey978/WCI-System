import { RfiStatus } from "@/generated/prisma/enums";
import { db } from "@/lib/db";

export class JobNotFoundError extends Error {
  constructor(jobId: string) {
    super(`Job ${jobId} not found`);
    this.name = "JobNotFoundError";
  }
}

export class RfiNotFoundError extends Error {
  constructor(rfiId: string) {
    super(`RFI ${rfiId} not found`);
    this.name = "RfiNotFoundError";
  }
}

export class RfiAlreadyClosedError extends Error {
  constructor(rfiId: string) {
    super(`RFI ${rfiId} is closed and cannot be answered.`);
    this.name = "RfiAlreadyClosedError";
  }
}

export interface CreateRfiInput {
  readonly organizationId: string;
  readonly jobId: string;
  readonly title: string;
  readonly question: string;
  readonly dueDate?: Date | null;
  readonly assigneeUserId?: string | null;
  readonly relatedItemRef?: string | null;
}

export async function createRfi(input: CreateRfiInput) {
  const job = await db.job.findFirst({ where: { id: input.jobId, organizationId: input.organizationId } });
  if (!job) throw new JobNotFoundError(input.jobId);

  return db.rfi.create({
    data: {
      organizationId: input.organizationId,
      jobId: input.jobId,
      title: input.title,
      question: input.question,
      dueDate: input.dueDate ?? null,
      assigneeUserId: input.assigneeUserId ?? null,
      relatedItemRef: input.relatedItemRef ?? null,
    },
  });
}

export async function answerRfi(organizationId: string, rfiId: string, answer: string) {
  const rfi = await db.rfi.findFirst({ where: { id: rfiId, organizationId } });
  if (!rfi) throw new RfiNotFoundError(rfiId);
  if (rfi.status === RfiStatus.CLOSED) throw new RfiAlreadyClosedError(rfiId);

  return db.rfi.update({
    where: { id: rfi.id },
    data: { status: RfiStatus.ANSWERED, answer, answeredAt: new Date() },
  });
}

export async function closeRfi(organizationId: string, rfiId: string) {
  const rfi = await db.rfi.findFirst({ where: { id: rfiId, organizationId } });
  if (!rfi) throw new RfiNotFoundError(rfiId);
  return db.rfi.update({ where: { id: rfi.id }, data: { status: RfiStatus.CLOSED } });
}
