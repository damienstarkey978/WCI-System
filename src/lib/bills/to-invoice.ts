/**
 * "Add to invoice" — take what a vendor charged and bill it to the client, with
 * markup, without re-keying it into the invoice builder.
 *
 * The design decision worth stating: each invoice line records the bill it came
 * from (`InvoiceLineItem.sourceBillId`). That link does two jobs. It stops the same
 * vendor cost being billed to the client twice — the easiest and most embarrassing
 * mistake this feature could enable — and it gives anyone questioning a charge a
 * path back to the receipt behind it.
 */

import { BillApprovalStatus, InvoiceStatus, InvoiceType } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { BillNotFoundError } from "@/lib/bills/service";
import { computeInvoiceTotals } from "@/lib/invoicing/terms";
import { applyMarkup, type BasisPoints } from "@/lib/money";

export class BillNotBillableError extends Error {
  constructor(status: BillApprovalStatus) {
    super(
      status === BillApprovalStatus.INBOX
        ? "This bill hasn't been reviewed yet. Open it and check the figures before billing them to a client."
        : "A voided bill can't be billed to a client.",
    );
    this.name = "BillNotBillableError";
  }
}

export class BillAlreadyInvoicedError extends Error {
  constructor(invoiceNumber: string) {
    super(`This bill is already on invoice ${invoiceNumber}. Remove it there first if you need to re-bill it.`);
    this.name = "BillAlreadyInvoicedError";
  }
}

export class InvoiceNotEditableError extends Error {
  constructor(invoiceNumber: string, status: InvoiceStatus) {
    super(`Invoice ${invoiceNumber} is ${status.replace(/_/g, " ").toLowerCase()} — only a draft can have lines added.`);
    this.name = "InvoiceNotEditableError";
  }
}

async function nextInvoiceNumber(organizationId: string): Promise<string> {
  const count = await db.invoice.count({ where: { organizationId } });
  return `INV-${String(count + 1).padStart(4, "0")}`;
}

export interface AddBillToInvoiceInput {
  readonly organizationId: string;
  readonly billId: string;
  /** Markup on the vendor's cost, in basis points. 2000 = 20%. */
  readonly markupBasisPoints: BasisPoints;
  /** Append to this draft invoice; omit to start a new one. */
  readonly invoiceId?: string | null;
}

/**
 * Push a bill's costs onto a client invoice at the given markup.
 *
 * One line per bill line, so the client's invoice keeps the same breakdown the
 * vendor gave — collapsing it to a single "materials" line loses the detail the
 * client is most likely to ask about. Each carries its cost code and the markup
 * applied, and lands on a DRAFT invoice: this proposes a charge, it doesn't send one.
 */
export async function addBillToInvoice(input: AddBillToInvoiceInput) {
  const bill = await db.bill.findFirst({
    where: { id: input.billId, organizationId: input.organizationId },
    include: {
      lineItems: { orderBy: { sortOrder: "asc" }, include: { costCode: { select: { code: true, name: true } } } },
      invoiceLines: { include: { invoice: { select: { invoiceNumber: true, status: true } } } },
    },
  });
  if (!bill) throw new BillNotFoundError(input.billId);

  if (bill.approvalStatus === BillApprovalStatus.INBOX || bill.approvalStatus === BillApprovalStatus.VOID) {
    throw new BillNotBillableError(bill.approvalStatus);
  }

  // A line on a voided invoice doesn't count as already billed — that charge was
  // withdrawn, and the cost is legitimately still to be recovered.
  const live = bill.invoiceLines.find((line) => line.invoice.status !== InvoiceStatus.VOID);
  if (live) throw new BillAlreadyInvoicedError(live.invoice.invoiceNumber);

  if (bill.lineItems.length === 0) {
    throw new Error("This bill has no cost lines to bill.");
  }

  const lines = bill.lineItems.map((item) => ({
    title: item.title,
    description: `${item.costCode.code} ${item.costCode.name} — ${bill.vendorName}`,
    amountCents: applyMarkup(item.amountCents, input.markupBasisPoints),
    costCodeId: item.costCodeId,
    unitCostCents: item.amountCents,
    quantityMilli: 1000,
    rateMode: "MARKUP" as const,
    rateBasisPoints: input.markupBasisPoints,
    // Inherited from the bill line, so a taxable material stays taxable when it
    // reaches the client rather than silently becoming exempt.
    taxable: item.costType === "MATERIAL",
    sourceBillId: bill.id,
  }));

  if (input.invoiceId) {
    const invoice = await db.invoice.findFirst({
      where: { id: input.invoiceId, organizationId: input.organizationId, jobId: bill.jobId },
      include: { lineItems: true },
    });
    if (!invoice) throw new Error("That invoice isn't on this job.");
    if (invoice.status !== InvoiceStatus.DRAFT) throw new InvoiceNotEditableError(invoice.invoiceNumber, invoice.status);

    const startOrder = invoice.lineItems.length;
    const merged = [
      ...invoice.lineItems.map((item) => ({ amountCents: item.amountCents, taxable: item.taxable })),
      ...lines.map((line) => ({ amountCents: line.amountCents, taxable: line.taxable })),
    ];
    const totals = computeInvoiceTotals(merged, invoice.taxRateBasisPoints);

    const [updated] = await db.$transaction([
      db.invoice.update({
        where: { id: invoice.id },
        data: { amountCents: totals.totalCents, taxCents: totals.taxCents },
      }),
      db.invoiceLineItem.createMany({
        data: lines.map((line, index) => ({ ...line, invoiceId: invoice.id, sortOrder: startOrder + index })),
      }),
    ]);
    return updated;
  }

  const totals = computeInvoiceTotals(lines, 0);
  return db.invoice.create({
    data: {
      organizationId: input.organizationId,
      jobId: bill.jobId,
      type: InvoiceType.LINE_ITEM,
      invoiceNumber: await nextInvoiceNumber(input.organizationId),
      amountCents: totals.totalCents,
      taxCents: totals.taxCents,
      lineItems: { create: lines.map((line, index) => ({ ...line, sortOrder: index })) },
    },
  });
}
