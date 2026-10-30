/**
 * POST /api/v1/folders/ensure-inspection-pictures
 *
 * Org-wide (or single-job) restore of Inspection Pictures folders from
 * JobPermitInspection rows. Prefer GET /folders?kind=inspection for one job
 * (self-heals on read); use this after a wipe/deploy to backfill every active job.
 *
 * Body: `{ "jobId"?: string }` — omit jobId to ensure all OPEN/WARRANTY/PRE_SALE
 * jobs that already have permits.
 */

import { apiError, withApiAuth } from "@/lib/api-auth";
import { formatZodIssues } from "@/lib/api-schemas";
import { db } from "@/lib/db";
import {
  ensureInspectionPictureFolders,
  ensureInspectionPictureFoldersForActiveJobs,
} from "@/lib/permitting/inspection-pictures";
import { JobNotFoundError } from "@/lib/permitting/service";
import { z } from "zod";

const bodySchema = z.object({
  jobId: z.string().min(1).max(64).optional(),
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
      await ensureInspectionPictureFolders(auth.organizationId, job.id);
      return Response.json({ data: { jobId: job.id, ok: true, scope: "job" } });
    }

    const summary = await ensureInspectionPictureFoldersForActiveJobs(auth.organizationId);
    return Response.json({ data: { ...summary, scope: "active_jobs" } });
  } catch (error) {
    if (error instanceof JobNotFoundError) {
      return apiError(404, "not_found", error.message);
    }
    throw error;
  }
});
