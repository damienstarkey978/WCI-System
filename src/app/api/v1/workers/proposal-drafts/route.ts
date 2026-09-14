/**
 * /api/v1/workers/proposal-drafts — the queued-proposal-draft counterpart to
 * /api/v1/webhooks/process's own doc comment: until a real queue (Inngest/
 * Trigger.dev) exists, an external scheduler hits this on an interval to run any
 * ProposalDraftJob rows draft_lead_proposal queued instead of drafting inline
 * (src/lib/jarvis/proposal-draft-jobs.ts explains why — the actual drafting call
 * can legitimately run past Netlify's non-configurable 60s function ceiling).
 *
 * This needs a *tighter* interval than the hourly webhook processor — every 1-2
 * minutes, ideally — since a person is sitting in the Jarvis chat waiting on the
 * result, not just waiting on a batch job. Safe to call as often as you like: it's a
 * no-op when nothing is queued, and jobs are claimed atomically so overlapping
 * invocations never double-process the same one.
 *
 * Same auth convention as /api/v1/webhooks/process: not gated by withApiAuth (a
 * scheduler call isn't scoped to one organization), just a shared CRON_SECRET
 * checked against `Authorization: Bearer $CRON_SECRET`.
 */

import { apiError } from "@/lib/api-auth";
import { cronSecret, isCronConfigured } from "@/lib/env";
import { processQueuedProposalDraftJobs } from "@/lib/jarvis/proposal-draft-jobs";

function isAuthorized(request: Request): boolean {
  if (!isCronConfigured()) return false;
  return request.headers.get("authorization") === `Bearer ${cronSecret()}`;
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return apiError(401, "unauthorized", "Missing or invalid scheduler authorization.");
  }
  return Response.json(await processQueuedProposalDraftJobs());
}

// Match /api/v1/webhooks/process: some schedulers (Vercel Cron) send GET by default.
export async function GET(request: Request) {
  return POST(request);
}
