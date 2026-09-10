"use server";

import { revalidatePath } from "next/cache";

import type { PaymentMethod } from "@/generated/prisma/enums";
import { requireAppUser } from "@/lib/auth";
import {
  CreditExceedsInvoiceError,
  CreditMemoNotFoundError,
  DepositNotFoundError,
  IllegalCreditMemoTransitionError,
  IllegalDepositTransitionError,
  applyCreditMemo,
  applyDepositToInvoice,
  createCreditMemo,
  createDeposit,
  issueCreditMemo,
  receiveDeposit,
  refundDeposit,
  voidCreditMemo,
} from "@/lib/invoicing/credits";
import {
  InvoiceNotFoundError,
  InvoiceNotSendableError,
  InvoiceVoidedError,
  resendInvoice,
  sendInvoice,
} from "@/lib/invoicing/service";
import { parseDollarsToCents } from "@/lib/money";

export interface ActionState {
  readonly error?: string;
  readonly ok?: boolean;
}

/**
 * Shared plumbing for every action on this screen: org scoping, turning the service
 * layer's known refusals into something the office can read, and revalidating. An
 * unrecognized error still throws — swallowing a surprise on a money screen is worse
 * than a stack trace.
 */
async function run(
  jobId: string,
  work: (organizationId: string) => Promise<unknown>,
): Promise<ActionState> {
  const user = await requireAppUser();
  try {
    await work(user.organizationId);
  } catch (error) {
    if (
      error instanceof CreditMemoNotFoundError ||
      error instanceof DepositNotFoundError ||
      error instanceof CreditExceedsInvoiceError ||
      error instanceof IllegalCreditMemoTransitionError ||
      error instanceof IllegalDepositTransitionError ||
      error instanceof InvoiceNotFoundError ||
      error instanceof InvoiceNotSendableError ||
      error instanceof InvoiceVoidedError
    ) {
      return { error: error.message };
    }
    if (error instanceof Error && (error.message.includes("Cannot parse") || error.name === "OverpaymentError")) {
      return { error: error.message };
    }
    if (error instanceof Error && /unique/i.test(error.message)) {
      return { error: "That number is already in use in this organization." };
    }
    throw error;
  }
  revalidatePath(`/jobs/${jobId}/invoices`);
  return { ok: true };
}

export async function sendInvoiceAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const jobId = String(formData.get("jobId") ?? "");
  const invoiceId = String(formData.get("invoiceId") ?? "");
  const state = await run(jobId, (organizationId) => sendInvoice(organizationId, invoiceId));
  revalidatePath(`/jobs/${jobId}/invoices/${invoiceId}`);
  return state;
}

export async function resendInvoiceAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const jobId = String(formData.get("jobId") ?? "");
  const invoiceId = String(formData.get("invoiceId") ?? "");
  const state = await run(jobId, (organizationId) => resendInvoice(organizationId, invoiceId));
  revalidatePath(`/jobs/${jobId}/invoices/${invoiceId}`);
  return state;
}

export async function createCreditMemoAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const jobId = String(formData.get("jobId") ?? "");
  const memoNumber = String(formData.get("memoNumber") ?? "").trim();
  const amountRaw = String(formData.get("amount") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  const invoiceId = String(formData.get("invoiceId") ?? "").trim();

  if (!memoNumber) return { error: "A credit memo number is required." };
  if (!amountRaw) return { error: "Amount is required." };

  return run(jobId, (organizationId) =>
    createCreditMemo({
      organizationId,
      jobId,
      memoNumber,
      amountCents: parseDollarsToCents(amountRaw),
      reason: reason || null,
      invoiceId: invoiceId || null,
    }),
  );
}

export async function issueCreditMemoAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const jobId = String(formData.get("jobId") ?? "");
  const creditMemoId = String(formData.get("creditMemoId") ?? "");
  return run(jobId, (organizationId) => issueCreditMemo(organizationId, creditMemoId));
}

export async function applyCreditMemoAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const jobId = String(formData.get("jobId") ?? "");
  const creditMemoId = String(formData.get("creditMemoId") ?? "");
  const invoiceId = String(formData.get("invoiceId") ?? "").trim();
  if (!invoiceId) return { error: "Choose the invoice to apply this credit to." };
  return run(jobId, (organizationId) => applyCreditMemo(organizationId, creditMemoId, invoiceId));
}

export async function voidCreditMemoAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const jobId = String(formData.get("jobId") ?? "");
  const creditMemoId = String(formData.get("creditMemoId") ?? "");
  return run(jobId, (organizationId) => voidCreditMemo(organizationId, creditMemoId));
}

export async function createDepositAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const jobId = String(formData.get("jobId") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  const amountRaw = String(formData.get("amount") ?? "");

  if (!title) return { error: "Give the deposit a name — what it is for." };
  if (!amountRaw) return { error: "Amount is required." };

  return run(jobId, (organizationId) =>
    createDeposit({ organizationId, jobId, title, amountCents: parseDollarsToCents(amountRaw) }),
  );
}

export async function receiveDepositAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const jobId = String(formData.get("jobId") ?? "");
  const depositId = String(formData.get("depositId") ?? "");
  const method = String(formData.get("method") ?? "MANUAL") as PaymentMethod;
  const reference = String(formData.get("reference") ?? "").trim();
  return run(jobId, (organizationId) =>
    receiveDeposit({ organizationId, depositId, method, reference: reference || null }),
  );
}

export async function applyDepositAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const jobId = String(formData.get("jobId") ?? "");
  const depositId = String(formData.get("depositId") ?? "");
  const invoiceId = String(formData.get("invoiceId") ?? "").trim();
  if (!invoiceId) return { error: "Choose the invoice to apply this deposit to." };
  return run(jobId, (organizationId) => applyDepositToInvoice({ organizationId, depositId, invoiceId }));
}

export async function refundDepositAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const jobId = String(formData.get("jobId") ?? "");
  const depositId = String(formData.get("depositId") ?? "");
  return run(jobId, (organizationId) => refundDeposit(organizationId, depositId));
}
