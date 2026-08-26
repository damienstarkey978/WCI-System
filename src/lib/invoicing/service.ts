/**
 * Database wiring for invoicing, draw schedules, and payments. The arithmetic lives
 * in src/lib/invoicing/calc.ts and stays testable without a database.
 */

import { InvoiceStatus, InvoiceType, type PaymentMethod } from "@/generated/prisma/enums";
import { applyPayment, computeDrawAmountCents, totalDrawPercentage } from "@/lib/invoicing/calc";
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

  const amountCents = usesLineItems
    ? input.lineItems!.reduce((total, line) => total + line.amountCents, 0)
    : input.amountCents!;

  const invoice = await db.invoice.create({
    data: {
      organizationId: input.organizationId,
      jobId: input.jobId,
      type: input.type,
      invoiceNumber: input.invoiceNumber,
      amountCents,
      issuedOn: input.issuedOn ?? null,
      dueOn: input.dueOn ?? null,
      ...(usesLineItems
        ? { lineItems: { create: input.lineItems!.map((line, index) => ({ ...line, sortOrder: index })) } }
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
      include: { payments: true },
    });
    if (!invoice) throw new InvoiceNotFoundError(input.invoiceId);
    if (invoice.status === InvoiceStatus.VOID) throw new InvoiceVoidedError(input.invoiceId);

    const previouslyPaidCents = invoice.payments.reduce((total, payment) => total + payment.amountCents, 0);
    // Throws OverpaymentError if this would exceed the invoice total — surfaced to
    // the caller unchanged so the API can map it to a 422.
    const result = applyPayment(invoice.amountCents, previouslyPaidCents, input.amountCents);

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
