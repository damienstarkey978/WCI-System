/**
 * Job lifecycle state machine.
 *
 * `Job.status` gates module behavior across the system (CLAUDE.md 2.3), so it is never
 * a free-text field and never assigned directly. Every change goes through
 * `assertJobStatusTransition` here, and every persisted change goes through
 * `transitionJobStatus` in src/lib/jobs.ts, which also writes a JobStatusEvent.
 *
 * This module is pure: no database, no framework. It is the unit-testable core.
 */

import { JobStatus, UserRole } from "@/generated/prisma/enums";

export interface TransitionRule {
  /** Roles permitted to make this transition. Undefined means any role may. */
  readonly requiresRole?: readonly UserRole[];
  /** Shown in the UI and in API errors to explain what the transition means. */
  readonly description: string;
}

/**
 * The complete set of legal transitions. Anything absent from this map is illegal —
 * notably PRE_SALE -> WARRANTY (a job cannot be under warranty before it was built)
 * and CLOSED -> WARRANTY (reopen to OPEN first, so the reopen is audited).
 */
export const JOB_STATUS_TRANSITIONS: Readonly<
  Record<JobStatus, Readonly<Partial<Record<JobStatus, TransitionRule>>>>
> = {
  [JobStatus.PRE_SALE]: {
    [JobStatus.OPEN]: { description: "Proposal accepted — job sold and under construction" },
    [JobStatus.CLOSED]: { description: "Lead lost or job cancelled before it started" },
  },
  [JobStatus.OPEN]: {
    [JobStatus.WARRANTY]: { description: "Construction complete — job is in its warranty period" },
    [JobStatus.CLOSED]: { description: "Job finished with no warranty period" },
  },
  [JobStatus.WARRANTY]: {
    [JobStatus.OPEN]: {
      requiresRole: [UserRole.ADMIN, UserRole.PM],
      description: "Warranty work large enough to be run as active construction again",
    },
    [JobStatus.CLOSED]: { description: "Warranty period expired" },
  },
  [JobStatus.CLOSED]: {
    [JobStatus.OPEN]: {
      requiresRole: [UserRole.ADMIN],
      description: "Reopen a closed job",
    },
  },
} as const;

export type JobStatusTransitionFailure =
  | { readonly kind: "SAME_STATUS" }
  | { readonly kind: "ILLEGAL_TRANSITION"; readonly allowed: readonly JobStatus[] }
  | { readonly kind: "INSUFFICIENT_ROLE"; readonly requiredRoles: readonly UserRole[] };

export class JobStatusTransitionError extends Error {
  readonly from: JobStatus;
  readonly to: JobStatus;
  readonly failure: JobStatusTransitionFailure;

  constructor(from: JobStatus, to: JobStatus, failure: JobStatusTransitionFailure) {
    super(describeFailure(from, to, failure));
    this.name = "JobStatusTransitionError";
    this.from = from;
    this.to = to;
    this.failure = failure;
  }
}

function describeFailure(from: JobStatus, to: JobStatus, failure: JobStatusTransitionFailure): string {
  switch (failure.kind) {
    case "SAME_STATUS":
      return `Job is already ${from}`;
    case "ILLEGAL_TRANSITION":
      return failure.allowed.length > 0
        ? `Cannot move a job from ${from} to ${to}. Allowed from ${from}: ${failure.allowed.join(", ")}`
        : `Cannot move a job out of ${from}`;
    case "INSUFFICIENT_ROLE":
      return `Moving a job from ${from} to ${to} requires one of: ${failure.requiredRoles.join(", ")}`;
  }
}

/** Every status reachable from `from`, ignoring role. */
export function allowedNextStatuses(from: JobStatus): readonly JobStatus[] {
  return Object.keys(JOB_STATUS_TRANSITIONS[from]) as JobStatus[];
}

/** The statuses `actorRole` may actually move a job to from `from`. */
export function allowedNextStatusesForRole(from: JobStatus, actorRole: UserRole): readonly JobStatus[] {
  return allowedNextStatuses(from).filter((to) => checkJobStatusTransition(from, to, actorRole) === null);
}

/**
 * Validate a transition. Returns `null` when it is legal, or the reason it is not.
 *
 * `actorRole` is optional so that pure validation (e.g. rendering which buttons could
 * ever exist) can be done without an actor; when it is omitted, role rules are skipped.
 */
export function checkJobStatusTransition(
  from: JobStatus,
  to: JobStatus,
  actorRole?: UserRole,
): JobStatusTransitionFailure | null {
  if (from === to) {
    return { kind: "SAME_STATUS" };
  }

  const rule = JOB_STATUS_TRANSITIONS[from][to];
  if (!rule) {
    return { kind: "ILLEGAL_TRANSITION", allowed: allowedNextStatuses(from) };
  }

  if (rule.requiresRole && actorRole !== undefined && !rule.requiresRole.includes(actorRole)) {
    return { kind: "INSUFFICIENT_ROLE", requiredRoles: rule.requiresRole };
  }

  return null;
}

export function canTransitionJobStatus(from: JobStatus, to: JobStatus, actorRole?: UserRole): boolean {
  return checkJobStatusTransition(from, to, actorRole) === null;
}

/** Throws a JobStatusTransitionError unless the transition is legal. */
export function assertJobStatusTransition(from: JobStatus, to: JobStatus, actorRole?: UserRole): void {
  const failure = checkJobStatusTransition(from, to, actorRole);
  if (failure) {
    throw new JobStatusTransitionError(from, to, failure);
  }
}

/** Jobs in these statuses are actively worked and appear in default job lists. */
export const ACTIVE_JOB_STATUSES: readonly JobStatus[] = [JobStatus.OPEN, JobStatus.WARRANTY];

/** Whether new financial commitments (POs, bills, invoices) may be created against a job. */
export function acceptsNewCommitments(status: JobStatus): boolean {
  return status === JobStatus.OPEN || status === JobStatus.WARRANTY;
}
