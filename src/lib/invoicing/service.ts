/**
 * Database wiring for invoicing, draw schedules, and payments. The arithmetic lives
 * in src/lib/invoicing/calc.ts and stays testable without a database.
 */

import { InvoiceStatus, InvoiceType, PaymentTerms, type PaymentMethod, type RateMode } from "@/generated/prisma/enums";
import { applyPayment, computeDrawAmountCents, totalDrawPercentage } from "@/lib/invoicing/calc";
import { computeInvoiceTotals, dueDateFor } from "@/lib/invoicing/terms";
import { db } from "@/lib/db";
import { acceptsNewCommitments } from "@/lib/job-status";
import { emitEvent } from "@/lib/webhooks";
import type { Cents, BasisPoints } from "@/lib/money";

export class JobNotFoundError extends Error {
  constructor(jobId: string) {
    super(`Job ${jobId} not found`);
    this.name = "JobNotFoundError";
  }
}

export class JobNotOpenError extends Error {
  constructor(jobId: string, status: string) {
    super(`Job ${jobId} is ${status} and cannot take new invoices.`);
    this.name = "JobNotOpenError";
  }
}

export class InvoiceNotFoundError extends Error {
  constructor(invoiceId: string) {
    super(`Invoice ${invoiceId} not found`);
    this.name = "InvoiceNotFoundError";
  }
}

export class InvoiceVoidedError extends Error {
  constructor(invoiceId: string) {
    super(`Invoice ${invoiceId} has been voided and cannot receive payments.`);
    this.name = "InvoiceVoidedError";
  }
}

export class InvoiceNotSendableError extends Error {
  constructor(invoiceId: string, status: string) {
    super(`A ${status} invoice cannot be sent.`);
    this.name = "InvoiceNotSendableError";
  }
}

export class DrawNotFoundError extends Error {
  constructor(drawId: string) {
    super(`Draw ${drawId} not found`);
    this.name = "DrawNotFoundError";
  }
}

export class DrawAlreadyInvoicedError extends Error {
  constructor(drawId: string) {
    super(`Draw ${drawId} already has an invoice. Void it first to regenerate.`);
    this.name = "DrawAlreadyInvoicedError";
  }
}

export class NoBudgetError extends Error {
  constructor(jobId: string) {
    super(`Job ${jobId} has no budget yet — send an estimate to the budget before generating draw invoices.`);
    this.name = "NoBudgetError";
  }
}

export class DrawScheduleOverallocatedError extends Error {
  constructor(totalBasisPoints: BasisPoints) {
    super(`Draw percentages sum to ${totalBasisPoints / 100}%, which is over 100%.`);
    this.name = "DrawScheduleOverallocatedError";
  }
}

export interface CreateInvoiceLineItemInput {
  readonly title: string;
  readonly description?: string | null;
  readonly amountCents: Cents;
  readonly taxable?: boolean;
  readonly costCodeId?: string | null;
  readonly quantityMilli?: number | null;
  readonly unitCostCents?: Cents | null;
  readonly rateMode?: RateMode | null;
  readonly rateBasisPoints?: BasisPoints | null;
}

export interface CreateInvoiceInput {
  readonly organizationId: string;
  readonly jobId: string;
  readonly type: InvoiceType;
  readonly invoiceNumber: string;
  readonly issuedOn?: Date | null;
  readonly dueOn?: Date | null;
  /** Required for FLAT; ignored (computed from lineItems) for LINE_ITEM/PROGRESS. */
  readonly amountCents?: Cents;
  readonly lineItems?: readonly CreateInvoiceLineItemInput[];
  readonly paymentTerms?: PaymentTerms;
  readonly taxRateBasisPoints?: BasisPoints;
  readonly clientMessage?: string | null;
}

async function assertJobAcceptsInvoices(organizationId: string, jobId: string) {
  const job = await db.job.findFirst({ where: { id: jobId, organizationId }, select: { id: true, status: true } });
  if (!job) throw new JobNotFoundError(jobId);
  if (!acceptsNewCommitments(job.status)) throw new JobNotOpenError(jobId, job.status);
  return job;
}

export async function createInvoice(input: CreateInvoiceInput) {
  await assertJobAcceptsInvoices(input.organizationId, input.jobId);

  const usesLineItems = input.type !== InvoiceType.FLAT;
  if (usesLineItems && (!input.lineItems || input.lineItems.length === 0)) {
    throw new Error(`${input.type} invoices require at least one line item.`);
  }
  if (!usesLineItems && input.amountCents === undefined) {
    throw new Error("FLAT invoices require amountCents.");
  }

  const taxRateBasisPoints = input.taxRateBasisPoints ?? 0;
  const paymentTerms = input.paymentTerms ?? PaymentTerms.NET_30;

  // A FLAT invoice is a single agreed number with no lines to apportion tax across,
  // so it is taken as the whole amount and taxed at nothing. Charging tax on a flat
  // invoice means writing it as a line.
  const totals = usesLineItems
    ? computeInvoiceTotals(
        input.lineItems!.map((line) => ({ amountCents: line.amountCents, taxable: line.taxable ?? false })),
        taxRateBasisPoints,
      )
    : { subtotalCents: input.amountCents!, taxableCents: 0, taxCents: 0, totalCents: input.amountCents! };

  // An explicit dueOn always wins — it is what the office typed. Otherwise derive it
  // from the terms, but only once there is an issue date to count from: an undated
  // draft has nothing to be 30 days after.
  const derivedDueOn =
    input.dueOn ?? (input.issuedOn ? dueDateFor(paymentTerms, input.issuedOn) : null);

  const invoice = await db.invoice.create({
    data: {
      organizationId: input.organizationId,
      jobId: input.jobId,
      type: input.type,
      invoiceNumber: input.invoiceNumber,
      amountCents: totals.totalCents,
      taxCents: totals.taxCents,
      taxRateBasisPoints,
      paymentTerms,
      clientMessage: input.clientMessage ?? null,
      issuedOn: input.issuedOn ?? null,
      dueOn: derivedDueOn,
      ...(usesLineItems
        ? {
            lineItems: {
              create: input.lineItems!.map((line, index) => ({
                title: line.title,
                description: line.description ?? null,
                amountCents: line.amountCents,
                taxable: line.taxable ?? false,
                costCodeId: line.costCodeId ?? null,
                quantityMilli: line.quantityMilli ?? null,
                unitCostCents: line.unitCostCents ?? null,
                rateMode: line.rateMode ?? null,
                rateBasisPoints: line.rateBasisPoints ?? null,
                sortOrder: index,
              })),
            },
          }
        : {}),
    },
    include: { lineItems: { orderBy: { sortOrder: "asc" } } },
  });

  await emitEvent(input.organizationId, "invoice.created", {
    invoiceId: invoice.id,
    jobId: invoice.jobId,
    type: invoice.type,
    amountCents: invoice.amountCents,
  });

  return invoice;
}

/**
 * Marks a DRAFT invoice SENT — the transition that makes it count toward
 * `amountInvoiced` in the funnel (CLAUDE.md 2.3). Extracted from the
 * /api/v1/invoices/{id}/send route so Jarvis's confirm-gated "send this invoice"
 * tool calls the exact same path a human clicking Send does, not a parallel copy.
 */
export async function sendInvoice(organizationId: string, invoiceId: string) {
  const invoice = await db.invoice.findFirst({ where: { id: invoiceId, organizationId } });
  if (!invoice) throw new InvoiceNotFoundError(invoiceId);
  if (invoice.status === InvoiceStatus.SENT) return { invoice, alreadySent: true };
  if (invoice.status !== InvoiceStatus.DRAFT) throw new InvoiceNotSendableError(invoiceId, invoice.status);

  const now = new Date();
  const issuedOn = invoice.issuedOn ?? now;

  const updated = await db.invoice.update({
    where: { id: invoice.id },
    data: {
      status: InvoiceStatus.SENT,
      issuedOn,
      // Only fill a due date we don't already have. CUSTOM returns null, which leaves
      // whatever the office set — including nothing.
      dueOn: invoice.dueOn ?? dueDateFor(invoice.paymentTerms, issuedOn),
      lastSentAt: now,
      sendCount: { increment: 1 },
    },
  });

  await emitEvent(organizationId, "invoice.sent", { invoiceId: updated.id, jobId: updated.jobId });

  return { invoice: updated, alreadySent: false };
}

/**
 * Send an already-sent invoice again — the client lost it, or is being chased.
 *
 * This deliberately does not touch issuedOn, dueOn or the payment terms: a resend is
 * a second copy of the same demand, and letting it restate the dates would quietly
 * hand a late client a fresh 30 days every time the office followed up.
 */
export async function resendInvoice(organizationId: string, invoiceId: string) {
  const invoice = await db.invoice.findFirst({ where: { id: invoiceId, organizationId } });
  if (!invoice) throw new InvoiceNotFoundError(invoiceId);
  if (invoice.status === InvoiceStatus.VOID) throw new InvoiceVoidedError(invoiceId);
  if (invoice.status === InvoiceStatus.DRAFT) throw new InvoiceNotSendableError(invoiceId, invoice.status);

  const updated = await db.invoice.update({
    where: { id: invoice.id },
    data: { lastSentAt: new Date(), sendCount: { increment: 1 } },
  });

  await emitEvent(organizationId, "invoice.resent", {
    invoiceId: updated.id,
    jobId: updated.jobId,
    sendCount: updated.sendCount,
  });

  return updated;
}

/**
 * Record that the client opened this invoice in the portal. Called from the client
 * portal's read path, so it must stay cheap and must never fail the read: knowing
 * whether they have seen it is useful, but not at the cost of showing it to them.
 */
export async function markInvoiceViewedByClient(invoiceId: string) {
  await db.invoice.updateMany({
    where: { id: invoiceId, status: { not: InvoiceStatus.DRAFT } },
    data: { clientLastViewedAt: new Date() },
  });
}

export interface CreateDrawInput {
  readonly title: string;
  readonly pctOfContractBasisPoints: BasisPoints;
  readonly linkedScheduleItemId?: string | null;
  readonly autoGeneratesInvoiceOnDate?: Date | null;
}

export interface CreateDrawScheduleInput {
  readonly organizationId: string;
  readonly jobId: string;
  readonly name?: string;
  readonly draws: readonly CreateDrawInput[];
}

export async function createDrawSchedule(input: CreateDrawScheduleInput) {
  const job = await db.job.findFirst({
    where: { id: input.jobId, organizationId: input.organizationId },
    select: { id: true },
  });
  if (!job) throw new JobNotFoundError(input.jobId);

  const totalBasisPoints = totalDrawPercentage(input.draws.map((draw) => draw.pctOfContractBasisPoints));
  if (totalBasisPoints > 10_000) {
    throw new DrawScheduleOverallocatedError(totalBasisPoints);
  }

  return db.drawSchedule.create({
    data: {
      organizationId: input.organizationId,
      jobId: input.jobId,
      name: input.name ?? "Draw Schedule",
      draws: {
        create: input.draws.map((draw, index) => ({
          title: draw.title,
          pctOfContractBasisPoints: draw.pctOfContractBasisPoints,
          linkedScheduleItemId: draw.linkedScheduleItemId ?? null,
          autoGeneratesInvoiceOnDate: draw.autoGeneratesInvoiceOnDate ?? null,
          sortOrder: index,
        })),
      },
    },
    include: { draws: { orderBy: { sortOrder: "asc" } } },
  });
}

/**
 * Generate the draft invoice for a draw, priced from the job's *current* revised
 * client price. A draw generates at most one invoice — the amount is frozen at
 * generation time, so a change order after the fact does not retroactively alter an
 * already-generated draw invoice.
 */
export async function generateDraftInvoiceForDraw(organizationId: string, drawId: string) {
  const draw = await db.draw.findFirst({
    where: { id: drawId, drawSchedule: { organizationId } },
    include: { drawSchedule: true, invoice: true },
  });
  if (!draw) throw new DrawNotFoundError(drawId);
  if (draw.invoice) throw new DrawAlreadyInvoicedError(drawId);

  const budgetTotals = await db.budgetLine.aggregate({
    where: { jobId: draw.drawSchedule.jobId },
    _sum: { revisedClientPriceCents: true },
  });
  const contractPriceCents = budgetTotals._sum.revisedClientPriceCents ?? 0;
  if (contractPriceCents === 0) {
    throw new NoBudgetError(draw.drawSchedule.jobId);
  }

  const amountCents = computeDrawAmountCents(contractPriceCents, draw.pctOfContractBasisPoints);
  const drawIndex = draw.sortOrder + 1;

  const invoice = await db.invoice.create({
    data: {
      organizationId,
      jobId: draw.drawSchedule.jobId,
      type: InvoiceType.PROGRESS,
      invoiceNumber: `DRAW-${drawIndex}-${draw.id.slice(-6)}`,
      amountCents,
      drawId: draw.id,
    },
  });

  return invoice;
}

export interface RecordPaymentInput {
  readonly organizationId: string;
  readonly invoiceId: string;
  readonly method: PaymentMethod;
  readonly amountCents: Cents;
  readonly reference?: string | null;
  readonly receivedAt?: Date;
}

export async function recordPayment(input: RecordPaymentInput) {
  return db.$transaction(async (tx) => {
    const invoice = await tx.invoice.findFirst({
      where: { id: input.invoiceId, organizationId: input.organizationId },
      include: { payments: true, creditMemos: { where: { status: "APPLIED" }, select: { amountCents: true } } },
    });
    if (!invoice) throw new InvoiceNotFoundError(input.invoiceId);
    if (invoice.status === InvoiceStatus.VOID) throw new InvoiceVoidedError(input.invoiceId);

    const previouslyPaidCents = invoice.payments.reduce((total, payment) => total + payment.amountCents, 0);
    // An applied credit memo reduces what is actually owed, so it counts against the
    // invoice total here. Without this, a $1,000 invoice carrying a $600 credit would
    // still accept a $1,000 payment and the job would show $600 it never collected.
    const creditedCents = invoice.creditMemos.reduce((total, memo) => total + memo.amountCents, 0);
    const owedCents = invoice.amountCents - creditedCents;
    // Throws OverpaymentError if this would exceed what is owed — surfaced to the
    // caller unchanged so the API can map it to a 422.
    const result = applyPayment(owedCents, previouslyPaidCents, input.amountCents);

    const payment = await tx.payment.create({
      data: {
        organizationId: input.organizationId,
        invoiceId: invoice.id,
        method: input.method,
        amountCents: input.amountCents,
        reference: input.reference ?? null,
        receivedAt: input.receivedAt ?? new Date(),
      },
    });

    const updatedInvoice = await tx.invoice.update({
      where: { id: invoice.id },
      data: {
        status: result.status as InvoiceStatus,
        paidAt: result.status === "PAID" ? (invoice.paidAt ?? new Date()) : invoice.paidAt,
      },
    });

    return { payment, invoice: updatedInvoice, remainingCents: result.remainingCents };
  }).then(async (result) => {
    if (result.invoice.status === InvoiceStatus.PAID) {
      await emitEvent(input.organizationId, "invoice.paid", {
        invoiceId: result.invoice.id,
        jobId: result.invoice.jobId,
        amountCents: result.invoice.amountCents,
      });
    }
    return result;
  });
}
