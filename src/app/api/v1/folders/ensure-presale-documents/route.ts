/**
 * POST /api/v1/folders/ensure-presale-documents
 *
 * Idempotent ensure of Buildertrend's "Pre-Sale Documents" folder on every job
 * (or one job). Also files already-uploaded proposal PDFs / ProposalReport
 * artifacts into that folder when found — never invents proposal files.
 *
 * Body:
 *   `{ "jobId"?: string, "jobStatuses"?: JobStatus[], "fileIntoFolder"?: boolean }`
 *   - omit jobId → all non-template jobs (optionally filtered by jobStatuses)
 *   - fileIntoFolder defaults true
 */

import { JobStatus } from "@/generated/prisma/enums";
import { apiError, withApiAuth } from "@/lib/api-auth";
import { formatZodIssues } from "@/lib/api-schemas";
import { db } from "@/lib/db";
import { FolderJobNotFoundError } from "@/lib/files/folders";
import {
  ensurePresaleDocumentsForAllJobs,
  ensurePresaleDocumentsForJob,
  PRESALE_DOCUMENTS_FOLDER_NAME,
} from "@/lib/files/presale-documents";
import { z } from "zod";

const jobStatusSchema = z.enum([
  JobStatus.PRE_SALE,
  JobStatus.OPEN,
  JobStatus.WARRANTY,
  JobStatus.CLOSED,
]);

const bodySchema = z.object({
  jobId: z.string().min(1).max(64).optional(),
  jobStatuses: z.array(jobStatusSchema).min(1).optional(),
  fileIntoFolder: z.boolean().optional(),
});

export const POST = withApiAuth(["files:write"], async (request, auth) => {
  let payload: unknown = {};
  const text = await request.text();
  if (text.trim()) {
    try {
      payload = JSON.parse(text);
    } catch {
      return apiError(400, "invalid_json", "Request body must be valid JSON.");
    }
  }

  const parsed = bodySchema.safeParse(payload);
  if (!parsed.success) {
    return apiError(422, "validation_failed", "Invalid body.", formatZodIssues(parsed.error));
  }

  try {
    if (parsed.data.jobId) {
      const job = await db.job.findFirst({
        where: { id: parsed.data.jobId, organizationId: auth.organizationId },
        select: { id: true },
      });
      if (!job) return apiError(404, "not_found", `Job ${parsed.data.jobId} not found.`);

      const result = await ensurePresaleDocumentsForJob(auth.organizationId, job.id, {
        fileIntoFolder: parsed.data.fileIntoFolder,
      });
      return Response.json({
        data: {
          ...result,
          folderLabel: PRESALE_DOCUMENTS_FOLDER_NAME,
          scope: "job",
        },
      });
    }

    const summary = await ensurePresaleDocumentsForAllJobs(auth.organizationId, {
      jobStatuses: parsed.data.jobStatuses,
      fileIntoFolder: parsed.data.fileIntoFolder,
    });
    return Response.json({
      data: {
        folderLabel: PRESALE_DOCUMENTS_FOLDER_NAME,
        scope: parsed.data.jobStatuses ? "filtered_jobs" : "all_jobs",
        jobCount: summary.jobCount,
        foldersCreated: summary.foldersCreated,
        foldersRenamed: summary.foldersRenamed,
        filesMoved: summary.filesMoved,
        jobs: summary.jobs,
      },
    });
  } catch (error) {
    if (error instanceof FolderJobNotFoundError) {
      return apiError(404, "not_found", error.message);
    }
    throw error;
  }
});
