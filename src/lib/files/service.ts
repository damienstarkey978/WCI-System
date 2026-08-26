/**
 * File metadata registration. No S3/R2 integration yet (CLAUDE.md 2.1 needs storage
 * credentials) — the caller uploads to wherever they already have storage and
 * registers the resulting URL here. The seam is deliberately this function, so
 * swapping in a real presigned-upload flow later doesn't touch the File model.
 */

import { db } from "@/lib/db";

export class JobNotFoundError extends Error {
  constructor(jobId: string) {
    super(`Job ${jobId} not found`);
    this.name = "JobNotFoundError";
  }
}

export class DailyLogNotFoundError extends Error {
  constructor(dailyLogId: string) {
    super(`Daily log ${dailyLogId} not found`);
    this.name = "DailyLogNotFoundError";
  }
}

export interface RegisterFileInput {
  readonly organizationId: string;
  readonly jobId: string;
  readonly uploadedByUserId: string;
  readonly fileName: string;
  readonly url: string;
  readonly mimeType?: string | null;
  readonly sizeBytes?: number | null;
  readonly category?: "DOCUMENT" | "PHOTO" | "VIDEO";
  readonly clientVisible?: boolean;
  readonly subVisible?: boolean;
  readonly dailyLogId?: string | null;
}

export async function registerFile(input: RegisterFileInput) {
  const job = await db.job.findFirst({ where: { id: input.jobId, organizationId: input.organizationId } });
  if (!job) throw new JobNotFoundError(input.jobId);

  if (input.dailyLogId) {
    const dailyLog = await db.dailyLog.findFirst({
      where: { id: input.dailyLogId, organizationId: input.organizationId, jobId: input.jobId },
    });
    if (!dailyLog) throw new DailyLogNotFoundError(input.dailyLogId);
  }

  const file = await db.file.create({
    data: {
      organizationId: input.organizationId,
      jobId: input.jobId,
      uploadedByUserId: input.uploadedByUserId,
      fileName: input.fileName,
      url: input.url,
      mimeType: input.mimeType ?? null,
      sizeBytes: input.sizeBytes ?? null,
      category: input.category ?? "DOCUMENT",
      clientVisible: input.clientVisible ?? true,
      subVisible: input.subVisible ?? true,
      dailyLogId: input.dailyLogId ?? null,
    },
  });

  return file;
}
