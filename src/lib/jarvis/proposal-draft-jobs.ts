/**
 * The async path for draft_lead_proposal (src/lib/jarvis/tools.ts). Why this exists:
 * the actual drafting call (src/lib/ai/estimate-assistant.ts's draftEstimateFromNotes,
 * up to 16,000 output tokens against the full active cost code + materials catalog)
 * can legitimately run past Netlify's non-configurable 60s function execution
 * ceiling on a complex job — a platform limit no amount of internal Jarvis-turn
 * deadline tuning (JARVIS_TURN_TIMEOUT_MS/JARVIS_REQUEST_TIMEOUT_MS,
 * src/lib/jarvis/assistant.ts and src/lib/jarvis/service.ts) can get around, since
 * it isn't the thing being timed.
 *
 * So draft_lead_proposal no longer calls draftLeadProposalFromNotes inline inside
 * the user's chat turn. It queues a ProposalDraftJob instead (queueProposalDraftJob)
 * and returns immediately. A separate worker route (POST /api/v1/workers/
 * proposal-drafts) — hit by an external scheduler on a short interval, same
 * CRON_SECRET-gated, "no real queue yet" convention /api/v1/webhooks/process already
 * uses (see that route's own doc comment) — calls processQueuedProposalDraftJobs,
 * which runs the exact same draftLeadProposalFromNotes logic, just outside any
 * Jarvis-turn deadline, in its own function invocation with the full ~60s to itself.
 * The result is posted back into the originating conversation as an ordinary
 * JarvisMessage, so it shows up next time the user looks at that Jarvis thread —
 * same UX as a normal (if delayed) Jarvis reply.
 */

import { ProposalDraftJobStatus } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { isCronConfigured } from "@/lib/env";
import { type DraftEstimateImageInput } from "@/lib/ai/estimate-assistant";
import { draftLeadProposalFromNotes, LeadNotFoundError } from "@/lib/crm/lead-proposal";
import type { Prisma } from "@/generated/prisma/client";

export { LeadNotFoundError };

/** Thrown by queueProposalDraftJob when no scheduler is configured to ever pick the
 *  job up — queuing it anyway would leave it QUEUED forever with no visible error,
 *  which is worse than the old inline timeout this whole async path replaced. */
export class ProposalDraftWorkerNotConfiguredError extends Error {
  constructor() {
    super(
      "The scheduled worker that drafts proposals isn't configured yet (CRON_SECRET is unset, or nothing is calling POST /api/v1/workers/proposal-drafts on an interval) — queuing this would never actually run.",
    );
    this.name = "ProposalDraftWorkerNotConfiguredError";
  }
}

export interface QueueProposalDraftJobInput {
  readonly organizationId: string;
  readonly leadId: string;
  readonly userId: string;
  readonly conversationId: string;
  readonly notes: string;
  readonly images?: readonly DraftEstimateImageInput[];
  readonly clientEmail?: string | null;
  readonly clientPhone?: string | null;
}

export async function queueProposalDraftJob(input: QueueProposalDraftJobInput) {
  // Only rules out the "CRON_SECRET was never set at all" case — it can't detect
  // "CRON_SECRET is set but no scheduler is actually calling the route", which is
  // why the worker route's own doc comment (src/app/api/v1/workers/proposal-drafts/
  // route.ts) still matters: this check is a floor, not a full guarantee.
  if (!isCronConfigured()) throw new ProposalDraftWorkerNotConfiguredError();

  const lead = await db.lead.findFirst({ where: { id: input.leadId, organizationId: input.organizationId }, select: { id: true } });
  if (!lead) throw new LeadNotFoundError(input.leadId);

  return db.proposalDraftJob.create({
    data: {
      organizationId: input.organizationId,
      leadId: input.leadId,
      userId: input.userId,
      conversationId: input.conversationId,
      notes: input.notes,
      clientEmail: input.clientEmail ?? undefined,
      clientPhone: input.clientPhone ?? undefined,
      images: input.images && input.images.length > 0 ? (input.images as unknown as Prisma.InputJsonValue) : undefined,
    },
  });
}

async function postConversationMessage(conversationId: string, content: string): Promise<void> {
  await db.jarvisMessage.create({ data: { conversationId, role: "ASSISTANT", content } });
  await db.jarvisConversation.update({ where: { id: conversationId }, data: { updatedAt: new Date() } });
}

/**
 * Claims exactly one QUEUED job atomically (QUEUED -> RUNNING via a conditional
 * updateMany) so two overlapping worker invocations — an external scheduler firing
 * faster than one run finishes — never process the same job twice.
 */
async function claimNextQueuedJob() {
  const next = await db.proposalDraftJob.findFirst({ where: { status: ProposalDraftJobStatus.QUEUED }, orderBy: { createdAt: "asc" } });
  if (!next) return null;

  const claimed = await db.proposalDraftJob.updateMany({
    where: { id: next.id, status: ProposalDraftJobStatus.QUEUED },
    data: { status: ProposalDraftJobStatus.RUNNING, startedAt: new Date() },
  });
  if (claimed.count === 0) return null; // lost the race to another invocation

  return next;
}

async function runOneJob(job: { id: string; organizationId: string; leadId: string; userId: string; conversationId: string; notes: string; clientEmail: string | null; clientPhone: string | null; images: Prisma.JsonValue }): Promise<{ succeeded: boolean }> {
  const images = (job.images as unknown as DraftEstimateImageInput[] | null) ?? undefined;

  try {
    const proposal = await draftLeadProposalFromNotes({
      organizationId: job.organizationId,
      leadId: job.leadId,
      userId: job.userId,
      notes: job.notes,
      images,
      clientEmail: job.clientEmail,
      clientPhone: job.clientPhone,
    });

    await db.proposalDraftJob.update({
      where: { id: job.id },
      data: { status: ProposalDraftJobStatus.SUCCEEDED, resultProposalId: proposal.id, finishedAt: new Date() },
    });
    await postConversationMessage(
      job.conversationId,
      `Drafted proposal "${proposal.title}" for the lead — status DRAFT, view it at /leads/proposals/${proposal.id}. A human needs to review and send it.`,
    );
    return { succeeded: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await db.proposalDraftJob.update({
      where: { id: job.id },
      data: { status: ProposalDraftJobStatus.FAILED, errorMessage: message, finishedAt: new Date() },
    });
    await postConversationMessage(job.conversationId, `I wasn't able to finish drafting that proposal: ${message}`);
    return { succeeded: false };
  }
}

export interface ProcessQueuedProposalDraftJobsOptions {
  /** Stop claiming new jobs once this much wall-clock time has passed in this
   *  invocation — leaves real margin under Netlify's non-configurable 60s function
   *  ceiling for the HTTP round trip itself and whatever job is still finishing.
   *  A job already claimed when the budget is checked still runs to completion;
   *  this only gates whether *another* one gets started. */
  readonly budgetMs?: number;
  /** Hard cap on jobs claimed in one invocation, independent of the time budget —
   *  keeps one invocation from claiming an unbounded backlog if drafts are
   *  unusually fast. */
  readonly maxJobs?: number;
}

const DEFAULT_BUDGET_MS = 45_000;
const DEFAULT_MAX_JOBS = 10;

export async function processQueuedProposalDraftJobs(options: ProcessQueuedProposalDraftJobsOptions = {}) {
  const budgetMs = options.budgetMs ?? DEFAULT_BUDGET_MS;
  const maxJobs = options.maxJobs ?? DEFAULT_MAX_JOBS;
  const startedAt = Date.now();

  let processed = 0;
  let succeeded = 0;
  let failed = 0;

  while (processed < maxJobs && Date.now() - startedAt < budgetMs) {
    const job = await claimNextQueuedJob();
    if (!job) break;

    const result = await runOneJob(job);
    processed += 1;
    if (result.succeeded) succeeded += 1;
    else failed += 1;
  }

  const remainingQueued = await db.proposalDraftJob.count({ where: { status: ProposalDraftJobStatus.QUEUED } });

  return { processed, succeeded, failed, remainingQueued };
}
