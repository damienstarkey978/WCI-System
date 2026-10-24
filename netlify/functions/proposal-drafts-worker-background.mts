/**
 * The actual proposal-drafting work, moved off the request/response-bound
 * /api/v1/workers/proposal-drafts route. That route's own invocation (via Netlify's
 * Next.js Runtime) is still bound by a normal function's duration ceiling — fine for
 * claiming+finishing a fast job, but a bigger scope or a slow Anthropic response can
 * run past it mid-draft (confirmed: a real run hit 59.3s before the HTTP caller had
 * already given up at ~31s). A Netlify Background Function is the one thing on this
 * platform with real headroom (15 minutes) and no HTTP response waiting on it, so the
 * route now just triggers this (see that route's own doc comment) and returns
 * immediately; this is where draftLeadProposalFromNotes's AI call and DB writes
 * actually happen.
 *
 * The `-background` suffix in this file's name is what tells Netlify to treat it this
 * way (ack the triggering request with 202 before running the handler at all, and
 * ignore whatever the handler returns) — it is not optional styling.
 *
 * Imports from ../../src/lib via relative paths rather than the app's "@/..." alias:
 * this function is bundled by Netlify independently of the Next.js app, and nothing
 * here needs Next.js itself — src/lib is already framework-agnostic domain logic
 * (CLAUDE.md 5), including the Prisma client, which connects through the pg driver
 * adapter rather than Prisma's native query-engine binary, so there's no native
 * binary for a separate bundle to miss.
 */
import { isCronConfigured, cronSecret } from "../../src/lib/env";
import { processQueuedProposalDraftJobs } from "../../src/lib/jarvis/proposal-draft-jobs";

function isAuthorized(request: Request): boolean {
  if (!isCronConfigured()) return false;
  return request.headers.get("authorization") === `Bearer ${cronSecret()}`;
}

const handler = async (request: Request) => {
  if (!isAuthorized(request)) {
    return new Response("unauthorized", { status: 401 });
  }

  // 13 minutes, not the platform's full 15 — leaves margin for whatever job is
  // mid-flight when the budget check fires to actually finish and get written.
  const result = await processQueuedProposalDraftJobs({ budgetMs: 13 * 60 * 1000 });
  console.log("[proposal-drafts-worker-background] finished", result);
  // Ignored by Netlify for a background function, but useful if ever invoked
  // directly (e.g. the admin diagnostics page) outside the real async path.
  return Response.json(result);
};

export default handler;
