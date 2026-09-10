/**
 * Credit memos and deposits — the two documents that move money against a job
 * without being an invoice or a payment.
 *
 * A credit memo reduces what a client owes. It is deliberately a document of its own
 * rather than an edit to the invoice or a negative payment: an invoice that went out
 * is a record of what was asked for, and quietly restating it destroys the trail the
 * office needs when the client asks why the number changed.
 *
 * A deposit is money taken before there is an invoice to put it against. It is a
 * liability until applied — the job holds the cash but hasn't earned it — so it is
 * tracked apart from payments and only becomes one when it lands on an invoice.
 */

import { CreditMemoStatus, DepositStatus, type PaymentMethod } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { recordPayment } from "@/lib/invoicing/service";
import { emitEvent } from "@/lib/webhooks";
import type { Cents } from "@/lib/money";

export class CreditMemoNotFoundError extends Error {
  constructor(id: string) {
    super(`No credit memo ${id} in this organization.`);
    this.name = "CreditMemoNotFoundError";
  }
}

export class DepositNotFoundError extends Error {
  constructor(id: string) {
    super(`No deposit ${id} in this organization.`);
    this.name = "DepositNotFoundError";
  }
}

export class CreditExceedsInvoiceError extends Error {
  constructor(creditCents: Cents, remainingCents: Cents) {
    super(
      `A credit of ${creditCents} cents exceeds the ${remainingCents} cents still owed on this invoice. ` +
        "Credit the amount actually outstanding, or refund the difference instead.",
    );
    this.name = "CreditExceedsInvoiceError";
  }
}

export class IllegalCreditMemoTransitionError extends Error {
  constructor(from: CreditMemoStatus, to: CreditMemoStatus) {
    super(`A credit memo can't go from ${from} to ${to}.`);
    this.name = "IllegalCreditMemoTransitionError";
  }
}

export class IllegalDepositTransitionError extends Error {
  constructor(from: DepositStatus, to: DepositStatus) {
    super(`A deposit can't go from ${from} to ${to}.`);
    this.name = "IllegalDepositTransitionError";
  }
}

const CREDIT_TRANSITIONS: Record<CreditMemoStatus, readonly CreditMemoStatus[]> = {
  DRAFT: [CreditMemoStatus.ISSUED, CreditMemoStatus.VOID],
  ISSUED: [CreditMemoStatus.APPLIED, CreditMemoStatus.VOID],
  // Applied is terminal: the money has already reduced what the client owes, and
  // voiding it afterwards would silently restore a balance nobody re-billed.
  APPLIED: [],
  VOID: [],
};

const DEPOSIT_TRANSITIONS: Record<DepositStatus, readonly DepositStatus[]> = {
  REQUESTED: [DepositStatus.RECEIVED, DepositStatus.REFUNDED],
  RECEIVED: [DepositStatus.APPLIED, DepositStatus.REFUNDED],
  APPLIED: [],
  REFUNDED: [],
};

/** What a job still owes on an invoice, after payments and credits already applied. */
export async function invoiceRemainingCents(organizationId: string, invoiceId: string): Promise<Cents> {
  const invoice = await db.invoice.findFirstOrThrow({
    where: { id: invoiceId, organizationId },
    include: {
      payments: { select: { amountCents: true } },
      creditMemos: { where: { status: CreditMemoStatus.APPLIED }, select: { amountCents: true } },
    },
  });
  const paid = invoice.payments.reduce((total, payment) => total + payment.amountCents, 0);
  const credited = invoice.creditMemos.reduce((total, memo) => total + memo.amountCents, 0);
  return invoice.amountCents - paid - credited;
}

export interface CreateCreditMemoInput {
  readonly organizationId: string;
  readonly jobId: string;
  readonly memoNumber: string;
  readonly amountCents: Cents;
  readonly reason?: string | null;
  readonly invoiceId?: string | null;
}

export async function createCreditMemo(input: CreateCreditMemoInput) {
  if (input.amountCents <= 0) throw new Error("A credit memo must be a positive amount.");

  return db.creditMemo.create({
    data: {
      organizationId: input.organizationId,
      jobId: input.jobId,
      invoiceId: input.invoiceId ?? null,
      memoNumber: input.memoNumber,
      amountCents: input.amountCents,
      reason: input.reason ?? null,
    },
  });
}

async function moveCreditMemo(organizationId: string, creditMemoId: string, to: CreditMemoStatus) {
  const memo = await db.creditMemo.findFirst({ where: { id: creditMemoId, organizationId } });
  if (!memo) throw new CreditMemoNotFoundError(creditMemoId);
  if (memo.status === to) return memo;
  if (!CREDIT_TRANSITIONS[memo.status].includes(to)) {
    throw new IllegalCreditMemoTransitionError(memo.status, to);
  }
  return memo;
}

export async function issueCreditMemo(organizationId: string, creditMemoId: string) {
  const memo = await moveCreditMemo(organizationId, creditMemoId, CreditMemoStatus.ISSUED);
  if (memo.status === CreditMemoStatus.ISSUED) return memo;

  const updated = await db.creditMemo.update({
    where: { id: memo.id },
    data: { status: CreditMemoStatus.ISSUED, issuedOn: memo.issuedOn ?? new Date() },
  });

  await emitEvent(organizationId, "credit_memo.issued", {
    creditMemoId: updated.id,
    jobId: updated.jobId,
    amountCents: updated.amountCents,
  });

  return updated;
}

/**
 * Apply an issued credit to an invoice. Refuses to credit more than is still owed:
 * over-crediting would leave a negative balance that reads as the builder owing the
 * client money on a job they're still billing. Refund the difference instead.
 */
export async function applyCreditMemo(organizationId: string, creditMemoId: string, invoiceId: string) {
  const memo = await moveCreditMemo(organizationId, creditMemoId, CreditMemoStatus.APPLIED);
  if (memo.status === CreditMemoStatus.APPLIED) return memo;

  const remaining = await invoiceRemainingCents(organizationId, invoiceId);
  if (memo.amountCents > remaining) throw new CreditExceedsInvoiceError(memo.amountCents, remaining);

  return db.creditMemo.update({
    where: { id: memo.id },
    data: { status: CreditMemoStatus.APPLIED, invoiceId, appliedAt: new Date() },
  });
}

export async function voidCreditMemo(organizationId: string, creditMemoId: string) {
  const memo = await moveCreditMemo(organizationId, creditMemoId, CreditMemoStatus.VOID);
  if (memo.status === CreditMemoStatus.VOID) return memo;
  return db.creditMemo.update({
    where: { id: memo.id },
    data: { status: CreditMemoStatus.VOID, voidedAt: new Date() },
  });
}

export interface CreateDepositInput {
  readonly organizationId: string;
  readonly jobId: string;
  readonly title: string;
  readonly amountCents: Cents;
  readonly requestedOn?: Date | null;
}

export async function createDeposit(input: CreateDepositInput) {
  if (input.amountCents <= 0) throw new Error("A deposit must be a positive amount.");

  return db.deposit.create({
    data: {
      organizationId: input.organizationId,
      jobId: input.jobId,
      title: input.title,
      amountCents: input.amountCents,
      requestedOn: input.requestedOn ?? new Date(),
    },
  });
}

async function moveDeposit(organizationId: string, depositId: string, to: DepositStatus) {
  const deposit = await db.deposit.findFirst({ where: { id: depositId, organizationId } });
  if (!deposit) throw new DepositNotFoundError(depositId);
  if (deposit.status === to) return deposit;
  if (!DEPOSIT_TRANSITIONS[deposit.status].includes(to)) {
    throw new IllegalDepositTransitionError(deposit.status, to);
  }
  return deposit;
}

export async function receiveDeposit(input: {
  readonly organizationId: string;
  readonly depositId: string;
  readonly method: PaymentMethod;
  readonly reference?: string | null;
}) {
  const deposit = await moveDeposit(input.organizationId, input.depositId, DepositStatus.RECEIVED);
  if (deposit.status === DepositStatus.RECEIVED) return deposit;

  const updated = await db.deposit.update({
    where: { id: deposit.id },
    data: {
      status: DepositStatus.RECEIVED,
      method: input.method,
      reference: input.reference ?? null,
      receivedAt: new Date(),
    },
  });

  await emitEvent(input.organizationId, "deposit.received", {
    depositId: updated.id,
    jobId: updated.jobId,
    amountCents: updated.amountCents,
  });

  return updated;
}

/**
 * Apply a received deposit to an invoice — the point it stops being a liability and
 * becomes a payment on that invoice.
 *
 * The payment goes through recordPayment() rather than being written directly, so
 * the invoice's own status moves to PARTIALLY_PAID or PAID and the invoice.paid
 * webhook fires, exactly as it would for a check. A bare payment row would leave an
 * invoice reading SENT while it was fully settled.
 */
export async function applyDepositToInvoice(input: {
  readonly organizationId: string;
  readonly depositId: string;
  readonly invoiceId: string;
}) {
  const deposit = await moveDeposit(input.organizationId, input.depositId, DepositStatus.APPLIED);
  if (deposit.status === DepositStatus.APPLIED) return deposit;

  const remaining = await invoiceRemainingCents(input.organizationId, input.invoiceId);
  if (deposit.amountCents > remaining) throw new CreditExceedsInvoiceError(deposit.amountCents, remaining);

  await recordPayment({
    organizationId: input.organizationId,
    invoiceId: input.invoiceId,
    method: deposit.method ?? "MANUAL",
    amountCents: deposit.amountCents,
    reference: `Deposit: ${deposit.title}`,
  });

  return db.deposit.update({
    where: { id: deposit.id },
    data: { status: DepositStatus.APPLIED, invoiceId: input.invoiceId, appliedAt: new Date() },
  });
}

export async function refundDeposit(organizationId: string, depositId: string) {
  const deposit = await moveDeposit(organizationId, depositId, DepositStatus.REFUNDED);
  if (deposit.status === DepositStatus.REFUNDED) return deposit;
  return db.deposit.update({
    where: { id: deposit.id },
    data: { status: DepositStatus.REFUNDED, refundedAt: new Date() },
  });
}
