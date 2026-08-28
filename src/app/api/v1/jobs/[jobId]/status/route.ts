/**
 * /api/v1/jobs/{jobId}/status — the only way an agent may change a job's lifecycle state.
 *
 * A dedicated endpoint rather than a PATCH field, because a transition is a guarded
 * domain action with an audit record, not a field assignment (CLAUDE.md 2.3).
 */

import { apiError, withApiAuth } from "@/lib/api-auth";
import { formatZodIssues, transitionJobStatusSchema } from "@/lib/api-schemas";
import { db } from "@/lib/db";
import { allowedNextStatuses, JobStatusTransitionError } from "@/lib/job-status";
import { JobNotFoundError, transitionJobStatus } from "@/lib/jobs";

type Context = { params: Promise<{ jobId: string }> };

export const POST = withApiAuth<Context>(["jobs:write"], async (request, auth, context) => {
  const { jobId } = await context.params;

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return apiError(400, "invalid_json", "Request body must be valid JSON.");
  }

  const parsed = transitionJobStatusSchema.safeParse(payload);
  if (!parsed.success) {
    return apiError(422, "validation_failed", "Invalid status transition request.", formatZodIssues(parsed.error));
  }

  try {
    const job = await transitionJobStatus({
      jobId,
      organizationId: auth.organizationId,
      to: parsed.data.status,
      actor: { kind: "apiKey", apiKeyId: auth.apiKeyId },
      reason: parsed.data.reason,
    });

    return Response.json({
      data: job,
      meta: { allowedNextStatuses: allowedNextStatuses(job.status) },
    });
  } catch (error) {
    if (error instanceof JobNotFoundError) {
      return apiError(404, "not_found", `No job ${jobId} in this organization.`);
    }
    if (error instanceof JobStatusTransitionError) {
      const current = await db.job.findFirst({
        where: { id: jobId, organizationId: auth.organizationId },
        select: { status: true },
      });
      return apiError(409, "illegal_transition", error.message, {
        currentStatus: current?.status ?? null,
        allowedNextStatuses: current ? allowedNextStatuses(current.status) : [],
      });
    }
    throw error;
  }
});
