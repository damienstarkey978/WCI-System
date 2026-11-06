/**
 * "Add from → Change Orders" — push approved CO client price onto a draft invoice
 * at a chosen %, without re-keying lines. Mirrors Buildertrend's Change Order Line
 * Items picker (new invoice % / amount, with an overview of what is already billed).
 *
 * Each resulting invoice line records `sourceChangeOrderLineId` (itemized) or
 * `sourceChangeOrderId` (flat CO) so the same CO scope cannot be billed twice past
 * 100% of its client price.
 */

import { ChangeOrderMode, ChangeOrderStatus, InvoiceStatus, InvoiceType } from "@/generated/prisma/enums";
import { extendedCostCents, priceWithRate } from "@/lib/budget/funnel";
import { db } from "@/lib/db";
import { InvoiceNotFoundError } from "@/lib/invoicing/service";
import { computeInvoiceTotals } from "@/lib/invoicing/terms";
import {
  BASIS_POINTS_SCALE,
  roundHalfAwayFromZero,
  type BasisPoints,
  type Cents,
} from "@/lib/money";

export class InvoiceNotEditableError extends Error {
  constructor(invoiceNumber: string, status: InvoiceStatus) {
    super(`Invoice ${invoiceNumber} is ${status.replace(/_/g, " ").toLowerCase()} — only a draft can have lines added.`);
    this.name = "InvoiceNotEditableError";
  }
}

export class ChangeOrderLineFullyInvoicedError extends Error {
  constructor(title: string) {
    super(`"${title}" is already fully invoiced. Lower the amount on an existing invoice first if you need to re-bill it.`);
    this.name = "ChangeOrderLineFullyInvoicedError";
  }
}

export class NoChangeOrderSelectionsError extends Error {
  constructor() {
    super("Select at least one change-order line with a non-zero invoice amount.");
    this.name = "NoChangeOrderSelectionsError";
  }
}

/** Client price of one itemized CO line (quantity × unit cost, then markup/margin). */
export function changeOrderLineClientPriceCents(line: {
  readonly quantityMilli: number;
  readonly unitCostCents: number;
  readonly rateMode: "MARKUP" | "MARGIN";
  readonly rateBasisPoints: number;
}): Cents {
  const cost = extendedCostCents(line.quantityMilli, line.unitCostCents);
  return priceWithRate(cost, line.rateMode, line.rateBasisPoints);
}

/** Portion of a client price to invoice, given a % in basis points. */
export function invoiceAmountForPercent(clientPriceCents: Cents, percentBasisPoints: BasisPoints): Cents {
  if (percentBasisPoints <= 0 || clientPriceCents === 0) return 0;
  return roundHalfAwayFromZero((clientPriceCents * percentBasisPoints) / BASIS_POINTS_SCALE);
}

export interface ChangeOrderLinePick {
  /** Itemized CO line id, XOR with changeOrderId for flat COs. */
  readonly changeOrderLineId?: string;
  /** Flat CO id (no line items). */
  readonly changeOrderId?: string;
  /** Percent of the CO line/CO client price to put on this invoice, in basis points. */
  readonly invoicePercentBasisPoints: BasisPoints;
}

export interface AddChangeOrderLinesToInvoiceInput {
  readonly organizationId: string;
  readonly invoiceId: string;
  readonly selections: readonly ChangeOrderLinePick[];
}

/**
 * Append selected CO scope onto a DRAFT invoice. Converts FLAT invoices to LINE_ITEM
 * when the first lines land so totals stay line-driven.
 */
export async function addChangeOrderLinesToInvoice(input: AddChangeOrderLinesToInvoiceInput) {
  const invoice = await db.invoice.findFirst({
    where: { id: input.invoiceId, organizationId: input.organizationId },
    include: { lineItems: { orderBy: { sortOrder: "asc" } } },
  });
  if (!invoice) throw new InvoiceNotFoundError(input.invoiceId);
  if (invoice.status !== InvoiceStatus.DRAFT) {
    throw new InvoiceNotEditableError(invoice.invoiceNumber, invoice.status);
  }

  const picks = input.selections.filter((row) => row.invoicePercentBasisPoints > 0);
  if (picks.length === 0) throw new NoChangeOrderSelectionsError();

  const lineIds = picks.map((p) => p.changeOrderLineId).filter((id): id is string => Boolean(id));
  const flatIds = picks.map((p) => p.changeOrderId).filter((id): id is string => Boolean(id));

  const [coLines, flatCos] = await Promise.all([
    lineIds.length === 0
      ? Promise.resolve([])
      : db.changeOrderLineItem.findMany({
          where: {
            id: { in: lineIds },
            changeOrder: {
              organizationId: input.organizationId,
              jobId: invoice.jobId,
              status: ChangeOrderStatus.APPROVED,
            },
          },
          include: {
            costCode: { select: { code: true, name: true } },
            changeOrder: { select: { id: true, number: true, title: true, status: true } },
            invoiceLines: {
              where: { invoice: { status: { not: InvoiceStatus.VOID } } },
              select: { amountCents: true },
            },
          },
        }),
    flatIds.length === 0
      ? Promise.resolve([])
      : db.changeOrder.findMany({
          where: {
            id: { in: flatIds },
            organizationId: input.organizationId,
            jobId: invoice.jobId,
            status: ChangeOrderStatus.APPROVED,
            mode: ChangeOrderMode.FLAT,
          },
          include: {
            invoiceLines: {
              where: { invoice: { status: { not: InvoiceStatus.VOID } } },
              select: { amountCents: true },
            },
          },
        }),
  ]);

  const coLineById = new Map(coLines.map((row) => [row.id, row]));
  const flatById = new Map(flatCos.map((row) => [row.id, row]));

  const newLines: Array<{
    title: string;
    description: string;
    amountCents: Cents;
    costCodeId: string | null;
    unitCostCents: number | null;
    quantityMilli: number | null;
    rateMode: "MARKUP" | "MARGIN" | null;
    rateBasisPoints: number | null;
    taxable: boolean;
    sourceChangeOrderLineId: string | null;
    sourceChangeOrderId: string | null;
  }> = [];

  for (const pick of picks) {
    if (pick.changeOrderLineId) {
      const line = coLineById.get(pick.changeOrderLineId);
      if (!line) continue;
      const clientPrice = changeOrderLineClientPriceCents(line);
      const already = line.invoiceLines.reduce((sum, row) => sum + row.amountCents, 0);
      const remaining = Math.max(0, clientPrice - already);
      if (remaining <= 0) throw new ChangeOrderLineFullyInvoicedError(line.title);
      const requested = invoiceAmountForPercent(clientPrice, pick.invoicePercentBasisPoints);
      const amountCents = Math.min(requested, remaining) as Cents;
      if (amountCents <= 0) continue;
      newLines.push({
        title: line.title,
        description: `CO ${String(line.changeOrder.number).padStart(4, "0")} — ${line.changeOrder.title} · ${line.costCode.code} ${line.costCode.name}`,
        amountCents,
        costCodeId: line.costCodeId,
        unitCostCents: line.unitCostCents,
        quantityMilli: line.quantityMilli,
        rateMode: line.rateMode,
        rateBasisPoints: line.rateBasisPoints,
        taxable: line.costType === "MATERIAL",
        sourceChangeOrderLineId: line.id,
        sourceChangeOrderId: null,
      });
      continue;
    }

    if (pick.changeOrderId) {
      const co = flatById.get(pick.changeOrderId);
      if (!co || co.flatClientPriceCents === null) continue;
      const clientPrice = co.flatClientPriceCents;
      const already = co.invoiceLines.reduce((sum, row) => sum + row.amountCents, 0);
      const remaining = Math.max(0, clientPrice - already);
      if (remaining <= 0) throw new ChangeOrderLineFullyInvoicedError(co.title);
      const requested = invoiceAmountForPercent(clientPrice, pick.invoicePercentBasisPoints);
      const amountCents = Math.min(requested, remaining) as Cents;
      if (amountCents <= 0) continue;
      newLines.push({
        title: co.title,
        description: `CO ${String(co.number).padStart(4, "0")} — flat change order`,
        amountCents,
        costCodeId: co.flatCostCodeId,
        unitCostCents: amountCents,
        quantityMilli: 1000,
        rateMode: "MARKUP",
        rateBasisPoints: 0,
        taxable: false,
        sourceChangeOrderLineId: null,
        sourceChangeOrderId: co.id,
      });
    }
  }

  if (newLines.length === 0) throw new NoChangeOrderSelectionsError();

  const startOrder = invoice.lineItems.length;
  const merged = [
    ...invoice.lineItems.map((item) => ({ amountCents: item.amountCents, taxable: item.taxable })),
    ...newLines.map((line) => ({ amountCents: line.amountCents, taxable: line.taxable })),
  ];
  // A previously FLAT draft that gains CO lines becomes LINE_ITEM so tax/total roll up from lines.
  const keepFlatAmount =
    invoice.type === InvoiceType.FLAT && invoice.lineItems.length === 0 && invoice.amountCents > 0;
  if (keepFlatAmount) {
    merged.unshift({ amountCents: invoice.amountCents, taxable: false });
  }
  const totals = computeInvoiceTotals(merged, invoice.taxRateBasisPoints);

  return db.$transaction(async (tx) => {
    if (keepFlatAmount) {
      await tx.invoiceLineItem.create({
        data: {
          invoiceId: invoice.id,
          title: invoice.title?.trim() || "Flat fee",
          description: null,
          amountCents: invoice.amountCents,
          taxable: false,
          sortOrder: 0,
        },
      });
    }
    const orderOffset = keepFlatAmount ? 1 : 0;
    await tx.invoiceLineItem.createMany({
      data: newLines.map((line, index) => ({
        ...line,
        invoiceId: invoice.id,
        sortOrder: startOrder + orderOffset + index,
      })),
    });
    return tx.invoice.update({
      where: { id: invoice.id },
      data: {
        type: InvoiceType.LINE_ITEM,
        amountCents: totals.totalCents,
        taxCents: totals.taxCents,
      },
      include: { lineItems: { orderBy: { sortOrder: "asc" } } },
    });
  });
}
