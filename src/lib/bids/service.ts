/**
 * Bid Board (CLAUDE.md 2.3/3, Phase 4): package creation, vendor invitation,
 * submission, builder-edit-on-behalf, and multi-vendor accept — a package can
 * end with more than one ACCEPTED submission (split scope across trades),
 * this is not a single-winner auction.
 *
 * Bid participation is deliberately independent of VendorJobAccess: a vendor
 * can be invited to bid with zero job access, and only gets real access once
 * awarded work (CLAUDE.md 3's "job access as a distinct state from
 * invitation/activation"). Nothing here checks VendorJobAccess.
 */

import { BidPackageStatus, BidSubmissionStatus, FinancialSourceType, PurchaseOrderStatus } from "@/generated/prisma/enums";
import { extendedCostCents } from "@/lib/budget/funnel";
import { db } from "@/lib/db";
import type { Cents } from "@/lib/money";
import { emitEvent } from "@/lib/webhooks";

export class JobNotFoundError extends Error {
  constructor(jobId: string) {
    super(`Job ${jobId} not found`);
    this.name = "JobNotFoundError";
  }
}

export class BidPackageNotFoundError extends Error {
  constructor(bidPackageId: string) {
    super(`Bid package ${bidPackageId} not found`);
    this.name = "BidPackageNotFoundError";
  }
}

export class BidPackageNotOpenError extends Error {
  constructor(bidPackageId: string, status: string) {
    super(`Bid package ${bidPackageId} is ${status} and cannot take new invitations.`);
    this.name = "BidPackageNotOpenError";
  }
}

export class VendorNotFoundError extends Error {
  constructor(vendorId: string) {
    super(`Vendor ${vendorId} not found`);
    this.name = "VendorNotFoundError";
  }
}

export class AlreadyInvitedError extends Error {
  constructor(bidPackageId: string, vendorId: string) {
    super(`Vendor ${vendorId} has already been invited to bid package ${bidPackageId}.`);
    this.name = "AlreadyInvitedError";
  }
}

export class BidSubmissionNotFoundError extends Error {
  constructor(bidSubmissionId: string) {
    super(`Bid submission ${bidSubmissionId} not found`);
    this.name = "BidSubmissionNotFoundError";
  }
}

export class BidSubmissionLockedError extends Error {
  constructor(bidSubmissionId: string) {
    super(`Bid submission ${bidSubmissionId} is locked and can no longer be edited.`);
    this.name = "BidSubmissionLockedError";
  }
}

export class BidSubmissionAlreadyDecidedError extends Error {
  constructor(bidSubmissionId: string, status: string) {
    super(`Bid submission ${bidSubmissionId} is already ${status}.`);
    this.name = "BidSubmissionAlreadyDecidedError";
  }
}

export class BidSubmissionNotSubmittedError extends Error {
  constructor(bidSubmissionId: string) {
    super(`Bid submission ${bidSubmissionId} has not been submitted yet.`);
    this.name = "BidSubmissionNotSubmittedError";
  }
}

export class VendorNotAssignedToSubmissionError extends Error {
  constructor(bidSubmissionId: string) {
    super(`Bid submission ${bidSubmissionId} does not belong to this vendor.`);
    this.name = "VendorNotAssignedToSubmissionError";
  }
}

export class NoAcceptedSubmissionsError extends Error {
  constructor(bidPackageId: string) {
    super(`Bid package ${bidPackageId} has no accepted submissions to award.`);
    this.name = "NoAcceptedSubmissionsError";
  }
}

export interface CreateBidPackageLineItemInput {
  readonly costCodeId?: string | null;
  readonly title: string;
  readonly description?: string | null;
  readonly quantityMilli?: number | null;
  readonly unit?: string | null;
}

export interface CreateBidPackageInput {
  readonly organizationId: string;
  readonly jobId: string;
  readonly title: string;
  readonly description?: string | null;
  readonly dueDate?: Date | null;
  readonly lineItems?: readonly CreateBidPackageLineItemInput[];
}

export async function createBidPackage(input: CreateBidPackageInput) {
  const job = await db.job.findFirst({ where: { id: input.jobId, organizationId: input.organizationId }, select: { id: true } });
  if (!job) throw new JobNotFoundError(input.jobId);

  return db.bidPackage.create({
    data: {
      organizationId: input.organizationId,
      jobId: input.jobId,
      title: input.title,
      description: input.description ?? null,
      dueDate: input.dueDate ?? null,
      lineItems: {
        create: (input.lineItems ?? []).map((line, index) => ({
          costCodeId: line.costCodeId ?? null,
          title: line.title,
          description: line.description ?? null,
          quantityMilli: line.quantityMilli ?? null,
          unit: line.unit ?? null,
          sortOrder: index,
        })),
      },
    },
    include: { lineItems: { orderBy: { sortOrder: "asc" } } },
  });
}

/** Invite a vendor to bid — creates the BidSubmission row in INVITED status. */
export async function inviteVendorToBid(organizationId: string, bidPackageId: string, vendorId: string) {
  const bidPackage = await db.bidPackage.findFirst({ where: { id: bidPackageId, organizationId } });
  if (!bidPackage) throw new BidPackageNotFoundError(bidPackageId);
  if (bidPackage.status !== BidPackageStatus.OPEN) throw new BidPackageNotOpenError(bidPackageId, bidPackage.status);

  const vendor = await db.vendor.findFirst({ where: { id: vendorId, organizationId } });
  if (!vendor) throw new VendorNotFoundError(vendorId);

  const existing = await db.bidSubmission.findUnique({ where: { bidPackageId_vendorId: { bidPackageId, vendorId } } });
  if (existing) throw new AlreadyInvitedError(bidPackageId, vendorId);

  return db.bidSubmission.create({ data: { bidPackageId, vendorId } });
}

export interface SubmitBidLineItemInput {
  readonly bidPackageLineItemId?: string | null;
  readonly title: string;
  readonly quantityMilli: number;
  readonly unitCostCents: Cents;
}

export interface SubmitBidInput {
  readonly organizationId: string;
  readonly bidSubmissionId: string;
  /** Set when a vendor is submitting their own bid via the portal; the submission must belong to them. */
  readonly asVendorId?: string;
  /** Set when staff/an agent is editing on the vendor's behalf (CLAUDE.md 3). */
  readonly asStaff?: boolean;
  readonly totalCents?: Cents;
  readonly notes?: string | null;
  readonly lineItems?: readonly SubmitBidLineItemInput[];
}

/**
 * Submit or edit a bid. A vendor edits their own; staff can edit on a
 * vendor's behalf (a phone bid, say), which sets `editedByStaff` as an audit
 * signal. Blocked once `lockedAt` is set or the submission has already been
 * decided (ACCEPTED/DECLINED) — a decision is final.
 */
export async function submitBid(input: SubmitBidInput) {
  const submission = await db.bidSubmission.findFirst({
    where: { id: input.bidSubmissionId, bidPackage: { organizationId: input.organizationId } },
  });
  if (!submission) throw new BidSubmissionNotFoundError(input.bidSubmissionId);
  if (input.asVendorId && submission.vendorId !== input.asVendorId) {
    throw new VendorNotAssignedToSubmissionError(input.bidSubmissionId);
  }
  if (submission.lockedAt !== null) throw new BidSubmissionLockedError(input.bidSubmissionId);
  if (submission.status === BidSubmissionStatus.ACCEPTED || submission.status === BidSubmissionStatus.DECLINED) {
    throw new BidSubmissionAlreadyDecidedError(input.bidSubmissionId, submission.status);
  }

  const totalCents = input.lineItems
    ? input.lineItems.reduce((total, line) => total + extendedCostCents(line.quantityMilli, line.unitCostCents), 0)
    : (input.totalCents ?? submission.totalCents);

  const updated = await db.$transaction(async (tx) => {
    if (input.lineItems) {
      await tx.bidSubmissionLineItem.deleteMany({ where: { bidSubmissionId: submission.id } });
    }

    return tx.bidSubmission.update({
      where: { id: submission.id },
      data: {
        status: BidSubmissionStatus.SUBMITTED,
        totalCents: totalCents ?? null,
        notes: input.notes ?? submission.notes,
        editedByStaff: submission.editedByStaff || Boolean(input.asStaff),
        submittedAt: submission.submittedAt ?? new Date(),
        ...(input.lineItems
          ? {
              lineItems: {
                create: input.lineItems.map((line, index) => ({
                  bidPackageLineItemId: line.bidPackageLineItemId ?? null,
                  title: line.title,
                  quantityMilli: line.quantityMilli,
                  unitCostCents: line.unitCostCents,
                  sortOrder: index,
                })),
              },
            }
          : {}),
      },
      include: { lineItems: { orderBy: { sortOrder: "asc" } } },
    });
  });

  await emitEvent(input.organizationId, "bid.submitted", {
    bidSubmissionId: updated.id,
    bidPackageId: updated.bidPackageId,
    vendorId: updated.vendorId,
    totalCents: updated.totalCents,
  });

  return updated;
}

/** Freeze a submission against further edits from either side (for fair comparison). Idempotent. */
export async function lockBidSubmission(organizationId: string, bidSubmissionId: string) {
  const submission = await db.bidSubmission.findFirst({
    where: { id: bidSubmissionId, bidPackage: { organizationId } },
  });
  if (!submission) throw new BidSubmissionNotFoundError(bidSubmissionId);

  return db.bidSubmission.update({ where: { id: submission.id }, data: { lockedAt: submission.lockedAt ?? new Date() } });
}

export async function acceptBidSubmission(organizationId: string, bidSubmissionId: string) {
  const submission = await db.bidSubmission.findFirst({
    where: { id: bidSubmissionId, bidPackage: { organizationId } },
  });
  if (!submission) throw new BidSubmissionNotFoundError(bidSubmissionId);
  if (submission.status === BidSubmissionStatus.ACCEPTED || submission.status === BidSubmissionStatus.DECLINED) {
    throw new BidSubmissionAlreadyDecidedError(bidSubmissionId, submission.status);
  }
  if (submission.status !== BidSubmissionStatus.SUBMITTED) throw new BidSubmissionNotSubmittedError(bidSubmissionId);

  const updated = await db.bidSubmission.update({
    where: { id: submission.id },
    data: { status: BidSubmissionStatus.ACCEPTED, decidedAt: new Date() },
  });

  await emitEvent(organizationId, "bid.accepted", {
    bidSubmissionId: updated.id,
    bidPackageId: updated.bidPackageId,
    vendorId: updated.vendorId,
    totalCents: updated.totalCents,
  });

  return updated;
}

export async function declineBidSubmission(organizationId: string, bidSubmissionId: string) {
  const submission = await db.bidSubmission.findFirst({
    where: { id: bidSubmissionId, bidPackage: { organizationId } },
  });
  if (!submission) throw new BidSubmissionNotFoundError(bidSubmissionId);
  if (submission.status === BidSubmissionStatus.ACCEPTED || submission.status === BidSubmissionStatus.DECLINED) {
    throw new BidSubmissionAlreadyDecidedError(bidSubmissionId, submission.status);
  }

  return db.bidSubmission.update({ where: { id: submission.id }, data: { status: BidSubmissionStatus.DECLINED, decidedAt: new Date() } });
}

export interface CloseBidPackageInput {
  readonly organizationId: string;
  readonly bidPackageId: string;
  readonly status: typeof BidPackageStatus.CLOSED | typeof BidPackageStatus.AWARDED;
}

export async function closeBidPackage(input: CloseBidPackageInput) {
  const bidPackage = await db.bidPackage.findFirst({
    where: { id: input.bidPackageId, organizationId: input.organizationId },
    include: { submissions: true },
  });
  if (!bidPackage) throw new BidPackageNotFoundError(input.bidPackageId);

  if (input.status === BidPackageStatus.AWARDED) {
    const hasAccepted = bidPackage.submissions.some((s) => s.status === BidSubmissionStatus.ACCEPTED);
    if (!hasAccepted) throw new NoAcceptedSubmissionsError(input.bidPackageId);
  }

  return db.bidPackage.update({ where: { id: bidPackage.id }, data: { status: input.status } });
}

export class MissingCostCodeError extends Error {
  constructor(lineTitle: string) {
    super(`Line item "${lineTitle}" has no cost code and no fallback cost code was provided.`);
    this.name = "MissingCostCodeError";
  }
}

export class BidSubmissionNotAcceptedError extends Error {
  constructor(bidSubmissionId: string) {
    super(`Bid submission ${bidSubmissionId} must be ACCEPTED before it can be pushed to a purchase order.`);
    this.name = "BidSubmissionNotAcceptedError";
  }
}

/**
 * "Push to PO" follow-up conversion (CLAUDE.md 2.3's Bid->PO, same explicit
 * conversion action pattern as Change Order->PO and Estimate->Budget). An
 * itemized submission's lines resolve their cost code from the
 * BidPackageLineItem they answer; a flat (totalCents-only) submission, or an
 * itemized line whose package line item has no cost code, needs
 * `fallbackCostCodeId` — same shape as a FLAT ChangeOrder's single
 * flatCostCodeId.
 */
export async function pushBidSubmissionToPurchaseOrder(
  organizationId: string,
  bidSubmissionId: string,
  poNumber: string,
  fallbackCostCodeId?: string,
) {
  const submission = await db.bidSubmission.findFirst({
    where: { id: bidSubmissionId, bidPackage: { organizationId } },
    include: { bidPackage: true, vendor: true, lineItems: { include: { bidPackageLineItem: true }, orderBy: { sortOrder: "asc" } } },
  });
  if (!submission) throw new BidSubmissionNotFoundError(bidSubmissionId);
  if (submission.status !== BidSubmissionStatus.ACCEPTED) throw new BidSubmissionNotAcceptedError(bidSubmissionId);

  const lineItems =
    submission.lineItems.length > 0
      ? submission.lineItems.map((line) => {
          const costCodeId = line.bidPackageLineItem?.costCodeId ?? fallbackCostCodeId;
          if (!costCodeId) throw new MissingCostCodeError(line.title);
          return { costCodeId, title: line.title, quantityMilli: line.quantityMilli, unitCostCents: line.unitCostCents };
        })
      : [
          (() => {
            if (!fallbackCostCodeId) throw new MissingCostCodeError(submission.bidPackage.title);
            return {
              costCodeId: fallbackCostCodeId,
              title: submission.bidPackage.title,
              quantityMilli: 1000,
              unitCostCents: submission.totalCents ?? 0,
            };
          })(),
        ];

  return db.purchaseOrder.create({
    data: {
      organizationId,
      jobId: submission.bidPackage.jobId,
      poNumber,
      vendorName: submission.vendor.name,
      vendorId: submission.vendorId,
      status: PurchaseOrderStatus.DRAFT,
      sourceType: FinancialSourceType.BID,
      sourceId: submission.id,
      lineItems: { create: lineItems.map((line, index) => ({ ...line, sortOrder: index })) },
    },
    include: { lineItems: { orderBy: { sortOrder: "asc" } } },
  });
}
