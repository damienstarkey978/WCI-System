/**
 * /api/v1/workers/proposal-drafts — the queued-proposal-draft counterpart to
 * /api/v1/webhooks/process's own doc comment: until a real queue (Inngest/
 * Trigger.dev) exists, an external scheduler hits this on an interval to run any
 * ProposalDraftJob rows draft_lead_proposal queued instead of drafting inline
 * (src/lib/jarvis/proposal-draft-jobs.ts explains why).
 *
 * This route itself no longer does the drafting. Confirmed in production: this
 * route's own invocation is bound by Netlify's Next.js Runtime function duration
 * just like any other route, which a real draft (a big scope, a slow Anthropic
 * response) can run past mid-draft — one run hit 59.3s while the HTTP caller had
 * already timed out at ~31s. The actual work now happens in
 * netlify/functions/proposal-drafts-worker-background.mts, a real Netlify
 * Background Function (15 minutes, no HTTP response waiting on it) — this route
 * just triggers that and returns right away. Falls back to running inline, bounded
 * the same way this route always was, only when no background function answers
 * (local dev, a non-Netlify host) so nothing silently stops working there.
 *
 * This needs a *tighter* interval than the hourly webhook processor — every 1-2
 * minutes, ideally — since a person is sitting in the Jarvis chat waiting on the
 * result, not just waiting on a batch job. Safe to call as often as you like: it's a
 * no-op when nothing is queued, and jobs are claimed atomically so overlapping
 * invocations (the cron's own trigger and this route's inline fallback alike) never
 * double-process the same one.
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

/** Returns true only once Netlify's platform has acked the background function
 *  (a 202 before the handler even runs) — anything else means nothing is actually
 *  listening there (not deployed on Netlify, or the function failed to deploy). */
async function triggerBackgroundWorker(request: Request): Promise<boolean> {
  try {
    const backgroundUrl = new URL("/.netlify/functions/proposal-drafts-worker-background", request.url);
    const response = await fetch(backgroundUrl, {
      method: "POST",
      headers: { Authorization: `Bearer ${cronSecret()}` },
    });
    return response.status === 202;
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return apiError(401, "unauthorized", "Missing or invalid scheduler authorization.");
  }

  if (await triggerBackgroundWorker(request)) {
    return Response.json({ accepted: true }, { status: 202 });
  }

  return Response.json(await processQueuedProposalDraftJobs());
}

// Match /api/v1/webhooks/process: some schedulers (Vercel Cron) send GET by default.
export async function GET(request: Request) {
  return POST(request);
}
