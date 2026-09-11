/**
 * Deleting financial records outright.
 *
 * Imports and integrations leave behind records that should never have existed —
 * a validation probe, a typo, a half-finished migration run — and there was no way
 * to remove one without hand-written SQL. That is what these are for.
 *
 * The rule throughout: **delete means "this never should have existed", not "undo
 * this".** A record that has taken part in the money flow is refused, and the error
 * names the right alternative. A cancelled PO, a voided bill and a voided invoice are
 * all still evidence of what was asked for and when; erasing them destroys the trail
 * the office needs when someone asks why a number changed, and silently moves the
 * commitment funnel (CLAUDE.md 2.3) underneath every report that reads it.
 *
 * So the bar is deliberately narrow. A caller who is refused and genuinely wants the
 * record gone cancels or voids it instead — which leaves a record of the decision.
 * That is the correct outcome, not an obstacle to work around.
 */

import { db } from "@/lib/db";

export class NotDiscardableError extends Error {
  /** Machine-readable, so a caller can tell these apart without parsing prose. */
  readonly reason: string;

  constructor(reason: string, message: string) {
    super(message);
    this.name = "NotDiscardableError";
    this.reason = reason;
  }
}

export class RecordNotFoundError extends Error {
  constructor(kind: string, id: string) {
    super(`No ${kind} ${id} in this organization.`);
    this.name = "RecordNotFoundError";
  }
}

/**
 * Delete a purchase order. Only a draft that nothing has been billed against: once a
 * PO is approved it is a commitment made to a vendor, and once a bill points at it,
 * deleting it strands that bill with no record of what authorised the spend.
 */
export async function deletePurchaseOrder(organizationId: string, purchaseOrderId: string) {
  const po = await db.purchaseOrder.findFirst({
    where: { id: purchaseOrderId, organizationId },
    include: { bills: { select: { id: true } } },
  });
  if (!po) throw new RecordNotFoundError("purchase order", purchaseOrderId);

  if (po.status !== "DRAFT") {
    throw new NotDiscardableError(
      "not_draft",
      `Purchase order ${po.poNumber} is ${po.status.replace(/_/g, " ").toLowerCase()}. Only a draft can be deleted — ` +
        "cancel it instead, which keeps the record of what was committed and then withdrawn.",
    );
  }
  if (po.bills.length > 0) {
    throw new NotDiscardableError(
      "has_bills",
      `Purchase order ${po.poNumber} has ${po.bills.length} bill(s) against it. Deleting it would leave those bills ` +
        "with no record of what authorised the spend.",
    );
  }

  await db.purchaseOrder.delete({ where: { id: po.id } });
  return { id: po.id, poNumber: po.poNumber };
}

/**
 * Delete a bill. Only one still in the inbox or under review: an approved bill is a
 * liability someone signed off on, and a paid one is money that left the account.
 * Also refused once its cost has been billed to a client, which would leave that
 * charge pointing at a cost that no longer exists.
 */
export async function deleteBill(organizationId: string, billId: string) {
  const bill = await db.bill.findFirst({
    where: { id: billId, organizationId },
    include: {
      invoiceLines: { select: { id: true } },
      lienWaivers: { where: { status: "RELEASED" }, select: { id: true } },
      files: { select: { id: true } },
    },
  });
  if (!bill) throw new RecordNotFoundError("bill", billId);

  const label = bill.billNumber ?? bill.title ?? bill.vendorName;

  if (bill.approvalStatus !== "INBOX" && bill.approvalStatus !== "IN_REVIEW") {
    throw new NotDiscardableError(
      "past_review",
      `Bill ${label} is ${bill.approvalStatus.replace(/_/g, " ").toLowerCase()}. Only a bill still in the inbox or ` +
        "under review can be deleted — void it instead, which keeps the record that it was received and rejected.",
    );
  }
  if (bill.invoiceLines.length > 0) {
    throw new NotDiscardableError(
      "billed_to_client",
      `Bill ${label} has already been billed to a client. Remove it from that invoice first, or the client's charge ` +
        "would point at a cost that no longer exists.",
    );
  }
  if (bill.lienWaivers.length > 0) {
    throw new NotDiscardableError(
      "waiver_released",
      `Bill ${label} has a released lien waiver against it. What went out to the vendor is a compliance record.`,
    );
  }
  if (bill.files.length > 0) {
    throw new NotDiscardableError(
      "has_attachments",
      `Bill ${label} has ${bill.files.length} attachment(s). Delete those from the job's Files first — removing the ` +
        "bill alone would leave the receipt stored with nothing pointing at it.",
    );
  }

  await db.bill.delete({ where: { id: bill.id } });
  return { id: bill.id, label };
}

/**
 * Delete an invoice. Only an unsent draft with nothing settled against it: once an
 * invoice has gone out it is what the client was asked to pay, and a payment or an
 * applied credit against it is money that actually moved.
 */
export async function deleteInvoice(organizationId: string, invoiceId: string) {
  const invoice = await db.invoice.findFirst({
    where: { id: invoiceId, organizationId },
    include: {
      payments: { select: { id: true } },
      creditMemos: { select: { id: true } },
      deposits: { select: { id: true } },
    },
  });
  if (!invoice) throw new RecordNotFoundError("invoice", invoiceId);

  if (invoice.status !== "DRAFT") {
    throw new NotDiscardableError(
      "not_draft",
      `Invoice ${invoice.invoiceNumber} is ${invoice.status.replace(/_/g, " ").toLowerCase()}. Only an unsent draft ` +
        "can be deleted — void it instead, which keeps the record of what the client was asked to pay.",
    );
  }
  if (invoice.payments.length > 0) {
    throw new NotDiscardableError(
      "has_payments",
      `Invoice ${invoice.invoiceNumber} has ${invoice.payments.length} payment(s) recorded against it.`,
    );
  }
  if (invoice.creditMemos.length > 0 || invoice.deposits.length > 0) {
    throw new NotDiscardableError(
      "has_credits",
      `Invoice ${invoice.invoiceNumber} has credit memos or deposits attached. Detach them first — they are records ` +
        "of money that moved, and deleting this would leave them pointing at nothing.",
    );
  }

  await db.invoice.delete({ where: { id: invoice.id } });
  return { id: invoice.id, invoiceNumber: invoice.invoiceNumber };
}
