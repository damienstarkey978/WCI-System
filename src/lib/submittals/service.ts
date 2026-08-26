/**
 * Submittals (CLAUDE.md 2.3/3, Phase 6): material specs / shop drawings that
 * go out for review to an architect, engineer, or inspector who "need NO
 * account" — a SubmittalReviewLink is a single signed link, not a portal
 * session, since these reviewers have no standing relationship with WCI OS.
 * Same token crypto as everything else (src/lib/secure-tokens.ts), its own
 * table since there's no session concept here at all.
 */

import { SubmittalStatus } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { generateSecureToken, parseSecureToken, secretMatches } from "@/lib/secure-tokens";
import { emitEvent } from "@/lib/webhooks";

const REVIEW_LINK_PREFIX = "wcisrl";
const REVIEW_LINK_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export class JobNotFoundError extends Error {
  constructor(jobId: string) {
    super(`Job ${jobId} not found`);
    this.name = "JobNotFoundError";
  }
}

export class SubmittalNotFoundError extends Error {
  constructor(submittalId: string) {
    super(`Submittal ${submittalId} not found`);
    this.name = "SubmittalNotFoundError";
  }
}

export interface CreateSubmittalInput {
  readonly organizationId: string;
  readonly jobId: string;
  readonly title: string;
  readonly type: "MATERIAL_SPEC" | "SHOP_DRAWING";
  /** The first revision — a submittal without at least one document isn't reviewable. */
  readonly documentUrl: string;
  readonly notes?: string | null;
}

export async function createSubmittal(input: CreateSubmittalInput) {
  const job = await db.job.findFirst({ where: { id: input.jobId, organizationId: input.organizationId }, select: { id: true } });
  if (!job) throw new JobNotFoundError(input.jobId);

  return db.submittal.create({
    data: {
      organizationId: input.organizationId,
      jobId: input.jobId,
      title: input.title,
      type: input.type,
      revisions: { create: [{ revisionNumber: 1, documentUrl: input.documentUrl, notes: input.notes ?? null }] },
    },
    include: { revisions: true },
  });
}

export async function addRevision(organizationId: string, submittalId: string, documentUrl: string, notes?: string | null) {
  const submittal = await db.submittal.findFirst({
    where: { id: submittalId, organizationId },
    include: { revisions: { orderBy: { revisionNumber: "desc" }, take: 1 } },
  });
  if (!submittal) throw new SubmittalNotFoundError(submittalId);

  const nextRevisionNumber = (submittal.revisions[0]?.revisionNumber ?? 0) + 1;

  return db.$transaction([
    db.submittalRevision.create({
      data: { submittalId, revisionNumber: nextRevisionNumber, documentUrl, notes: notes ?? null },
    }),
    db.submittal.update({ where: { id: submittalId }, data: { status: SubmittalStatus.PENDING } }),
  ]).then(([revision]) => revision);
}

export interface IssueReviewLinkInput {
  readonly organizationId: string;
  readonly submittalId: string;
  readonly reviewerName: string;
  readonly reviewerEmail: string;
}

export async function issueReviewLink(input: IssueReviewLinkInput) {
  const submittal = await db.submittal.findFirst({ where: { id: input.submittalId, organizationId: input.organizationId } });
  if (!submittal) throw new SubmittalNotFoundError(input.submittalId);

  const generated = generateSecureToken(REVIEW_LINK_PREFIX);
  await db.submittalReviewLink.create({
    data: {
      submittalId: input.submittalId,
      reviewerName: input.reviewerName,
      reviewerEmail: input.reviewerEmail,
      tokenId: generated.tokenId,
      hashedSecret: generated.hashedSecret,
      expiresAt: new Date(Date.now() + REVIEW_LINK_TTL_MS),
    },
  });

  await emitEvent(input.organizationId, "submittal.review_requested", {
    submittalId: input.submittalId,
    reviewerEmail: input.reviewerEmail,
  });

  return { token: generated.token };
}

export class InvalidReviewLinkError extends Error {
  constructor() {
    super("This review link is invalid, expired, or has already been used.");
    this.name = "InvalidReviewLinkError";
  }
}

export interface RecordReviewInput {
  readonly token: string;
  readonly decision: typeof SubmittalStatus.APPROVED | typeof SubmittalStatus.REJECTED | typeof SubmittalStatus.REVISE_AND_RESUBMIT;
  readonly comments?: string | null;
}

/** Redeem a review link: records the reviewer's decision, single-use. */
export async function recordReview(input: RecordReviewInput) {
  const parsed = parseSecureToken(REVIEW_LINK_PREFIX, input.token);
  if (!parsed) throw new InvalidReviewLinkError();

  const link = await db.submittalReviewLink.findUnique({ where: { tokenId: parsed.tokenId } });
  if (
    !link ||
    !secretMatches(parsed.secret, link.hashedSecret) ||
    link.decidedAt !== null ||
    link.expiresAt.getTime() <= Date.now()
  ) {
    throw new InvalidReviewLinkError();
  }

  const [updatedLink, submittal] = await db.$transaction([
    db.submittalReviewLink.update({
      where: { id: link.id },
      data: { decision: input.decision, comments: input.comments ?? null, decidedAt: new Date() },
    }),
    db.submittal.update({ where: { id: link.submittalId }, data: { status: input.decision } }),
  ]);

  await emitEvent(submittal.organizationId, "submittal.reviewed", {
    submittalId: submittal.id,
    decision: input.decision,
    reviewerEmail: link.reviewerEmail,
  });

  return { link: updatedLink, submittal };
}
