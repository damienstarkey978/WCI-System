import { describe, expect, it } from "vitest";

import { JobStatus, UserRole } from "@/generated/prisma/enums";
import {
  acceptsNewCommitments,
  allowedNextStatuses,
  allowedNextStatusesForRole,
  assertJobStatusTransition,
  canTransitionJobStatus,
  checkJobStatusTransition,
  JobStatusTransitionError,
} from "@/lib/job-status";

describe("legal transitions", () => {
  it("sells a pre-sale job into construction", () => {
    expect(canTransitionJobStatus(JobStatus.PRE_SALE, JobStatus.OPEN)).toBe(true);
  });

  it("cancels a pre-sale job", () => {
    expect(canTransitionJobStatus(JobStatus.PRE_SALE, JobStatus.CLOSED)).toBe(true);
  });

  it("moves a finished job into warranty", () => {
    expect(canTransitionJobStatus(JobStatus.OPEN, JobStatus.WARRANTY)).toBe(true);
  });

  it("closes a job out of warranty", () => {
    expect(canTransitionJobStatus(JobStatus.WARRANTY, JobStatus.CLOSED)).toBe(true);
  });
});

describe("illegal transitions", () => {
  it("refuses to put an unbuilt job under warranty", () => {
    expect(canTransitionJobStatus(JobStatus.PRE_SALE, JobStatus.WARRANTY)).toBe(false);
  });

  it("refuses to move a closed job straight to warranty", () => {
    expect(canTransitionJobStatus(JobStatus.CLOSED, JobStatus.WARRANTY)).toBe(false);
  });

  it("refuses to send an open job back to pre-sale", () => {
    expect(canTransitionJobStatus(JobStatus.OPEN, JobStatus.PRE_SALE)).toBe(false);
  });

  it("treats a no-op transition as a failure so callers notice", () => {
    expect(checkJobStatusTransition(JobStatus.OPEN, JobStatus.OPEN)).toEqual({ kind: "SAME_STATUS" });
  });

  it("reports which statuses were allowed", () => {
    const failure = checkJobStatusTransition(JobStatus.PRE_SALE, JobStatus.WARRANTY);
    expect(failure).toEqual({
      kind: "ILLEGAL_TRANSITION",
      allowed: [JobStatus.OPEN, JobStatus.CLOSED],
    });
  });
});

describe("role guards", () => {
  it("lets only an admin reopen a closed job", () => {
    expect(canTransitionJobStatus(JobStatus.CLOSED, JobStatus.OPEN, UserRole.ADMIN)).toBe(true);
    expect(canTransitionJobStatus(JobStatus.CLOSED, JobStatus.OPEN, UserRole.PM)).toBe(false);
    expect(canTransitionJobStatus(JobStatus.CLOSED, JobStatus.OPEN, UserRole.FIELD)).toBe(false);
  });

  it("lets an admin or a PM pull a warranty job back into construction", () => {
    expect(canTransitionJobStatus(JobStatus.WARRANTY, JobStatus.OPEN, UserRole.PM)).toBe(true);
    expect(canTransitionJobStatus(JobStatus.WARRANTY, JobStatus.OPEN, UserRole.OFFICE)).toBe(false);
  });

  it("skips role rules when no actor role is supplied", () => {
    expect(canTransitionJobStatus(JobStatus.CLOSED, JobStatus.OPEN)).toBe(true);
  });

  it("names the required roles in the failure", () => {
    expect(checkJobStatusTransition(JobStatus.CLOSED, JobStatus.OPEN, UserRole.FIELD)).toEqual({
      kind: "INSUFFICIENT_ROLE",
      requiredRoles: [UserRole.ADMIN],
    });
  });

  it("lists what a given role may actually do", () => {
    expect(allowedNextStatusesForRole(JobStatus.CLOSED, UserRole.ADMIN)).toEqual([JobStatus.OPEN]);
    expect(allowedNextStatusesForRole(JobStatus.CLOSED, UserRole.PM)).toEqual([]);
  });
});

describe("assertJobStatusTransition", () => {
  it("passes silently on a legal transition", () => {
    expect(() => assertJobStatusTransition(JobStatus.PRE_SALE, JobStatus.OPEN)).not.toThrow();
  });

  it("throws a typed error carrying the failure", () => {
    try {
      assertJobStatusTransition(JobStatus.PRE_SALE, JobStatus.WARRANTY);
      expect.unreachable("expected a JobStatusTransitionError");
    } catch (error) {
      expect(error).toBeInstanceOf(JobStatusTransitionError);
      const typed = error as JobStatusTransitionError;
      expect(typed.from).toBe(JobStatus.PRE_SALE);
      expect(typed.to).toBe(JobStatus.WARRANTY);
      expect(typed.failure.kind).toBe("ILLEGAL_TRANSITION");
    }
  });
});

describe("every status is reachable and terminal states are deliberate", () => {
  it("can reach every status from PRE_SALE", () => {
    const seen = new Set<JobStatus>([JobStatus.PRE_SALE]);
    const queue: JobStatus[] = [JobStatus.PRE_SALE];
    while (queue.length > 0) {
      const current = queue.shift() as JobStatus;
      for (const next of allowedNextStatuses(current)) {
        if (!seen.has(next)) {
          seen.add(next);
          queue.push(next);
        }
      }
    }
    expect(seen.size).toBe(Object.keys(JobStatus).length);
  });

  it("allows only reopening out of CLOSED", () => {
    expect(allowedNextStatuses(JobStatus.CLOSED)).toEqual([JobStatus.OPEN]);
  });
});

describe("acceptsNewCommitments", () => {
  it("allows financial commitments on open and warranty jobs only", () => {
    expect(acceptsNewCommitments(JobStatus.OPEN)).toBe(true);
    expect(acceptsNewCommitments(JobStatus.WARRANTY)).toBe(true);
    expect(acceptsNewCommitments(JobStatus.PRE_SALE)).toBe(false);
    expect(acceptsNewCommitments(JobStatus.CLOSED)).toBe(false);
  });
});
