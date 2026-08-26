/**
 * /api/v1/purchase-orders/match-by-road-name
 *
 * Duke's job matcher, exposed as a helper so he doesn't reimplement the heuristic
 * (CLAUDE.md 2.5). Give it a PO name, a vendor description, or a raw card-transaction
 * string, and it returns the jobs it could belong to.
 *
 * `bestMatch` is null whenever the top two candidates tie — two houses on the same
 * street with no house number in the string. Duke should raise
 * `bill.unmatched_transaction` in that case rather than picking one, because booking
 * a cost to the wrong job is worse than leaving it unassigned.
 */

import { apiError, withApiAuth } from "@/lib/api-auth";
import { formatZodIssues, matchByRoadNameSchema } from "@/lib/api-schemas";
import { db } from "@/lib/db";
import { matchJobsByRoadName } from "@/lib/matching/road-name";
import { ACTIVE_JOB_STATUSES } from "@/lib/job-status";

export const POST = withApiAuth(["jobs:read"], async (request, auth) => {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return apiError(400, "invalid_json", "Request body must be valid JSON.");
  }

  const parsed = matchByRoadNameSchema.safeParse(payload);
  if (!parsed.success) {
    return apiError(422, "validation_failed", "Invalid match request.", formatZodIssues(parsed.error));
  }
  const { query, minimumScore, limit } = parsed.data;

  // Only active jobs are candidates: a purchase almost never belongs to a job that
  // is closed or not yet sold, and including them invites wrong matches.
  const jobs = await db.job.findMany({
    where: {
      organizationId: auth.organizationId,
      isTemplate: false,
      status: { in: [...ACTIVE_JOB_STATUSES] },
    },
    select: { id: true, name: true, prefix: true, addressLine1: true },
  });

  const result = matchJobsByRoadName(query, jobs, { minimumScore, limit });

  return Response.json({
    data: {
      query: result.query,
      bestMatch: result.bestMatch,
      ambiguous: result.ambiguous,
      matches: result.matches,
      candidatesConsidered: jobs.length,
    },
  });
});
