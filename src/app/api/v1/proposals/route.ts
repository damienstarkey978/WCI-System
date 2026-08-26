/** /api/v1/proposals — create/list Proposals (the e-sign wrapper around an Estimate). */

import { apiError, withApiAuth } from "@/lib/api-auth";
import { createProposalSchema, formatZodIssues } from "@/lib/api-schemas";
import {
  ClientNotFoundError,
  createProposal,
  EstimateJobMismatchError,
  EstimateNotFoundError,
  JobNotFoundError,
} from "@/lib/proposals/service";
import { db } from "@/lib/db";

export const GET = withApiAuth(["proposals:read"], async (request, auth) => {
  const params = new URL(request.url).searchParams;
  const jobId = params.get("jobId");
  const status = params.get("status");

  const proposals = await db.proposal.findMany({
    where: {
      organizationId: auth.organizationId,
      ...(jobId ? { jobId } : {}),
      ...(status ? { status: status as never } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  return Response.json({ data: proposals });
});

export const POST = withApiAuth(["proposals:write"], async (request, auth) => {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return apiError(400, "invalid_json", "Request body must be valid JSON.");
  }

  const parsed = createProposalSchema.safeParse(payload);
  if (!parsed.success) {
    return apiError(422, "validation_failed", "The proposal could not be created.", formatZodIssues(parsed.error));
  }

  try {
    const proposal = await createProposal({ organizationId: auth.organizationId, ...parsed.data });
    return Response.json({ data: proposal }, { status: 201 });
  } catch (error) {
    if (error instanceof JobNotFoundError) return apiError(422, "unknown_job", error.message);
    if (error instanceof EstimateNotFoundError) return apiError(422, "unknown_estimate", error.message);
    if (error instanceof EstimateJobMismatchError) return apiError(422, "estimate_job_mismatch", error.message);
    if (error instanceof ClientNotFoundError) return apiError(422, "unknown_client", error.message);
    throw error;
  }
});
