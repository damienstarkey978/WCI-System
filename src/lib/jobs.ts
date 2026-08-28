/**
 * Job persistence helpers.
 *
 * The pure state-machine rules live in src/lib/job-status.ts; this module is the only
 * supported way to *persist* a status change, and it always writes a JobStatusEvent so
 * the lifecycle is auditable.
 */

import type { JobModel } from "@/generated/prisma/models";
import { JobStatus, type UserRole } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { assertJobStatusTransition, JobStatusTransitionError } from "@/lib/job-status";
import { emitEvent } from "@/lib/webhooks";

/** Who made a change: a signed-in human, or an agent's API key. Never both. */
export type Actor =
  | { readonly kind: "user"; readonly userId: string; readonly role: UserRole }
  | { readonly kind: "apiKey"; readonly apiKeyId: string };

export class JobNotFoundError extends Error {
  constructor(jobId: string) {
    super(`Job ${jobId} not found`);
    this.name = "JobNotFoundError";
  }
}

export interface TransitionJobStatusInput {
  readonly jobId: string;
  readonly organizationId: string;
  readonly to: JobStatus;
  /**
   * Omitted when the transition has no internal actor to record — e.g. a
   * Proposal's PRE_SALE -> OPEN triggered by a client's e-signature
   * (src/lib/proposals/service.ts): the client isn't a User or an ApiKey, and
   * forcing one through here would misattribute the audit trail. Both
   * JobStatusEvent actor columns are nullable for exactly this case.
   */
  readonly actor?: Actor;
  readonly reason?: string;
}

/**
 * Move a job to a new status, or throw.
 *
 * Runs in a transaction: the guard is re-checked against the row read inside the
 * transaction, so two concurrent transitions cannot both pass validation.
 *
 * @throws {JobNotFoundError} when the job does not exist in this organization
 * @throws {JobStatusTransitionError} when the transition is illegal or the actor's role is insufficient
 */
export async function transitionJobStatus(input: TransitionJobStatusInput): Promise<JobModel> {
  const { jobId, organizationId, to, actor, reason } = input;

  const { updated, from } = await db.$transaction(async (tx) => {
    const job = await tx.job.findFirst({ where: { id: jobId, organizationId } });
    if (!job) {
      throw new JobNotFoundError(jobId);
    }

    // API keys (and no actor at all) are not role-authorized, so role rules are
    // checked only for human actors.
    assertJobStatusTransition(job.status, to, actor?.kind === "user" ? actor.role : undefined);

    const updatedJob = await tx.job.update({
      where: { id: job.id },
      data: {
        status: to,
        // Record real-world milestones the first time they happen.
        actualStart: to === JobStatus.OPEN && job.actualStart === null ? new Date() : job.actualStart,
        actualEnd:
          (to === JobStatus.WARRANTY || to === JobStatus.CLOSED) && job.actualEnd === null
            ? new Date()
            : job.actualEnd,
      },
    });

    await tx.jobStatusEvent.create({
      data: {
        jobId: job.id,
        from: job.status,
        to,
        actorUserId: actor?.kind === "user" ? actor.userId : null,
        actorApiKeyId: actor?.kind === "apiKey" ? actor.apiKeyId : null,
        reason: reason ?? null,
      },
    });

    return { updated: updatedJob, from: job.status };
  });

  // Emitted here, after commit, so every caller (this route, Jarvis, proposal
  // e-signature auto-transitions, the admin UI) reports consistently — this is
  // the one supported place a status change is persisted, per the module doc above.
  await emitEvent(organizationId, "job.status_changed", { jobId: updated.id, from, to });

  return updated;
}

export { JobStatusTransitionError };
