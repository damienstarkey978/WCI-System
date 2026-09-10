/**
 * The bill intake pipeline — the arrival end of src/lib/bills/service.ts.
 *
 * Buildertrend's Bills page is an inbox, not a form: receipts arrive as uploads or
 * forwarded vendor emails, AI reads them, and a human confirms before any of it
 * counts as money owed. The pipeline mirrors that:
 *
 *   INBOX ──────────► IN_REVIEW ──► APPROVED ──► READY_FOR_PAYMENT ──► PAID
 *   (arrived,         (extracted,   (approvers
 *    unread)           unconfirmed)  signed off)
 *
 * The one rule that matters: nothing reaches READY_FOR_PAYMENT without a person.
 * OCR lands bills in IN_REVIEW (never further), and requireApprovalsComplete()
 * blocks the APPROVED → READY_FOR_PAYMENT hop until every assigned approver has
 * actually signed. See src/lib/ai/bill-ocr-service.ts for the extraction side.
 */

import type { BillApprovalStatus } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { BillNotFoundError } from "@/lib/bills/service";

export class ApprovalsIncompleteError extends Error {
  constructor(
    public readonly billId: string,
    public readonly outstanding: readonly string[],
  ) {
    super(
      `Bill ${billId} still needs ${outstanding.length} approval${outstanding.length === 1 ? "" : "s"} before it can be paid.`,
    );
    this.name = "ApprovalsIncompleteError";
  }
}

export class ApproverNotAssignedError extends Error {
  constructor(billId: string, userId: string) {
    super(`User ${userId} is not an assigned approver on bill ${billId}.`);
    this.name = "ApproverNotAssignedError";
  }
}

/** Per-status counts for the Bills page tabs. */
export type BillStatusCounts = Record<BillApprovalStatus, number> & { ALL: number };

export async function billStatusCounts(organizationId: string, jobId?: string): Promise<BillStatusCounts> {
  const grouped = await db.bill.groupBy({
    by: ["approvalStatus"],
    where: { organizationId, ...(jobId ? { jobId } : {}) },
    _count: { _all: true },
  });

  const counts = {
    INBOX: 0,
    IN_REVIEW: 0,
    APPROVED: 0,
    READY_FOR_PAYMENT: 0,
    PAID: 0,
    VOID: 0,
    ALL: 0,
  } as BillStatusCounts;

  for (const row of grouped) {
    counts[row.approvalStatus] = row._count._all;
    // VOID bills are deliberately excluded from ALL — a voided bill isn't a bill the
    // office still has to do something about, and including it would make the "All
    // Bills" total row disagree with what the job actually owes.
    if (row.approvalStatus !== "VOID") counts.ALL += row._count._all;
  }
  return counts;
}

/** Assign the staff who must sign off before this bill can be paid. */
export async function setBillApprovers(input: {
  readonly organizationId: string;
  readonly billId: string;
  readonly approverUserIds: readonly string[];
}) {
  const bill = await db.bill.findFirst({
    where: { id: input.billId, organizationId: input.organizationId },
    select: { id: true },
  });
  if (!bill) throw new BillNotFoundError(input.billId);

  const wanted = [...new Set(input.approverUserIds)];
  const known = await db.user.findMany({
    where: { id: { in: wanted }, organizationId: input.organizationId },
    select: { id: true },
  });
  if (known.length !== wanted.length) {
    const knownIds = new Set(known.map((user) => user.id));
    throw new Error(`Not in this organization: ${wanted.filter((id) => !knownIds.has(id)).join(", ")}`);
  }

  // Replace wholesale, but keep any approval already given: re-assigning the same
  // person shouldn't quietly discard their signature.
  const existing = await db.billApproval.findMany({ where: { billId: bill.id } });
  const keep = new Set(wanted);

  await db.$transaction([
    db.billApproval.deleteMany({ where: { billId: bill.id, approverUserId: { notIn: [...keep] } } }),
    ...wanted
      .filter((userId) => !existing.some((row) => row.approverUserId === userId))
      .map((userId) => db.billApproval.create({ data: { billId: bill.id, approverUserId: userId } })),
  ]);

  return db.billApproval.findMany({ where: { billId: bill.id }, include: { approverUser: { select: { name: true, email: true } } } });
}

/** Record one approver's sign-off. */
export async function approveBillAs(input: {
  readonly organizationId: string;
  readonly billId: string;
  readonly approverUserId: string;
  readonly note?: string | null;
}) {
  const bill = await db.bill.findFirst({
    where: { id: input.billId, organizationId: input.organizationId },
    select: { id: true },
  });
  if (!bill) throw new BillNotFoundError(input.billId);

  const approval = await db.billApproval.findUnique({
    where: { billId_approverUserId: { billId: bill.id, approverUserId: input.approverUserId } },
  });
  if (!approval) throw new ApproverNotAssignedError(input.billId, input.approverUserId);

  return db.billApproval.update({
    where: { id: approval.id },
    data: { approvedAt: new Date(), declinedAt: null, note: input.note ?? null },
  });
}

/**
 * Throw unless every assigned approver has signed. Call this before letting a bill
 * move to READY_FOR_PAYMENT.
 *
 * A bill with no approvers assigned passes — plenty of small receipts don't need a
 * committee, and requiring one would block the common case. The gate exists for
 * bills where someone deliberately assigned approvers.
 */
export async function requireApprovalsComplete(organizationId: string, billId: string): Promise<void> {
  const bill = await db.bill.findFirst({
    where: { id: billId, organizationId },
    select: { id: true, approvals: { include: { approverUser: { select: { name: true, email: true } } } } },
  });
  if (!bill) throw new BillNotFoundError(billId);

  const outstanding = bill.approvals
    .filter((approval) => approval.approvedAt === null)
    .map((approval) => approval.approverUser.name ?? approval.approverUser.email);

  if (outstanding.length > 0) throw new ApprovalsIncompleteError(billId, outstanding);
}

/**
 * Move a bill out of the Inbox once a human has looked at it. Separate from
 * updateBillStatus() because this is the one transition that isn't about money —
 * it's "someone has now seen this".
 */
export async function claimFromInbox(input: {
  readonly organizationId: string;
  readonly billId: string;
  readonly userId?: string | null;
}) {
  const bill = await db.bill.findFirst({
    where: { id: input.billId, organizationId: input.organizationId },
    select: { id: true, approvalStatus: true, createdByUserId: true },
  });
  if (!bill) throw new BillNotFoundError(input.billId);
  if (bill.approvalStatus !== "INBOX") return bill;

  return db.bill.update({
    where: { id: bill.id },
    data: {
      approvalStatus: "IN_REVIEW",
      // Attribute it to whoever picked it up, if it arrived with no owner (a
      // forwarded email has no staff member attached to it).
      createdByUserId: bill.createdByUserId ?? input.userId ?? null,
    },
  });
}

/**
 * The per-organization address vendors' bills can be forwarded to.
 *
 * Deriving it from the org slug rather than storing it means it can't drift out of
 * sync with the org, and an inbound handler can resolve the org straight from the
 * recipient address without a lookup table.
 */
export function billingInboxAddress(orgSlug: string, domain = "inbox.worldconstructionjax.com"): string {
  return `bills-${orgSlug}@${domain}`;
}

/** Recover the org slug from an address billingInboxAddress() produced. */
export function orgSlugFromInboxAddress(address: string): string | null {
  const match = /^bills-([a-z0-9-]+)@/i.exec(address.trim().toLowerCase());
  return match ? match[1] : null;
}
