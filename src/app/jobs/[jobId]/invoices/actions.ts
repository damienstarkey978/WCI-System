"use server";

import { revalidatePath } from "next/cache";

import type { PaymentMethod } from "@/generated/prisma/enums";
import { InvoiceType } from "@/generated/prisma/enums";
import { requireAppUser } from "@/lib/auth";
import {
  createInvoice,
  InvoiceNotFoundError,
  InvoiceVoidedError,
  JobNotFoundError,
  JobNotOpenError,
  recordPayment,
} from "@/lib/invoicing/service";
import { parseDollarsToCents } from "@/lib/money";
import { db } from "@/lib/db";
import { QuickBooksApiError, QuickBooksNotConfiguredError } from "@/lib/quickbooks/client";
import { QuickBooksNotConnectedError } from "@/lib/quickbooks/connection-service";
import { InvoiceHasNoClientError, syncInvoiceToQuickBooks } from "@/lib/quickbooks/sync/invoices";

export interface ActionState {
  readonly error?: string;
  readonly ok?: boolean;
}

export async function createInvoiceAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireAppUser();

  const jobId = String(formData.get("jobId") ?? "");
  const invoiceNumber = String(formData.get("invoiceNumber") ?? "").trim();
  const typeRaw = String(formData.get("type") ?? "FLAT");
  const type = typeRaw === "LINE_ITEM" ? InvoiceType.LINE_ITEM : InvoiceType.FLAT;
  const dueOnRaw = String(formData.get("dueOn") ?? "");

  if (!invoiceNumber) {
    return { error: "Invoice number is required." };
  }

  try {
    if (type === InvoiceType.FLAT) {
      const amountRaw = String(formData.get("amount") ?? "");
      if (!amountRaw) return { error: "Amount is required for a flat invoice." };
      const amountCents = parseDollarsToCents(amountRaw);

      await createInvoice({
        organizationId: user.organizationId,
        jobId,
        type,
        invoiceNumber,
        dueOn: dueOnRaw ? new Date(dueOnRaw) : null,
        amountCents,
      });
    } else {
      const titles = formData.getAll("lineItemTitle").map(String);
      const amounts = formData.getAll("lineItemAmount").map(String);
      const lineItems = titles
        .map((title, index) => ({ title: title.trim(), amountRaw: amounts[index] ?? "" }))
        .filter((line) => line.title && line.amountRaw)
        .map((line) => ({ title: line.title, amountCents: parseDollarsToCents(line.amountRaw) }));

      if (lineItems.length === 0) {
        return { error: "Add at least one line item with a title and amount." };
      }

      await createInvoice({
        organizationId: user.organizationId,
        jobId,
        type,
        invoiceNumber,
        dueOn: dueOnRaw ? new Date(dueOnRaw) : null,
        lineItems,
      });
    }
  } catch (error) {
    if (error instanceof JobNotFoundError || error instanceof JobNotOpenError) return { error: error.message };
    if (error instanceof Error && error.message.includes("Cannot parse")) return { error: error.message };
    if (error instanceof Error && /unique/i.test(error.message)) {
      return { error: `Invoice number "${invoiceNumber}" is already in use on this job.` };
    }
    throw error;
  }

  revalidatePath(`/jobs/${jobId}/invoices`);
  return { ok: true };
}

export async function recordPaymentAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireAppUser();

  const jobId = String(formData.get("jobId") ?? "");
  const invoiceId = String(formData.get("invoiceId") ?? "");
  const method = String(formData.get("method") ?? "MANUAL") as PaymentMethod;
  const amountRaw = String(formData.get("amount") ?? "");
  const reference = String(formData.get("reference") ?? "").trim();

  if (!amountRaw) return { error: "Amount is required." };

  try {
    const amountCents = parseDollarsToCents(amountRaw);
    await recordPayment({
      organizationId: user.organizationId,
      invoiceId,
      method,
      amountCents,
      reference: reference || null,
    });
  } catch (error) {
    if (error instanceof InvoiceNotFoundError || error instanceof InvoiceVoidedError) return { error: error.message };
    if (error instanceof Error && (error.message.includes("Cannot parse") || error.name === "OverpaymentError")) {
      return { error: error.message };
    }
    throw error;
  }

  revalidatePath(`/jobs/${jobId}/invoices`);
  return { ok: true };
}

export async function voidInvoiceAction(formData: FormData): Promise<void> {
  const user = await requireAppUser();

  const jobId = String(formData.get("jobId") ?? "");
  const invoiceId = String(formData.get("invoiceId") ?? "");

  const invoice = await db.invoice.findFirst({ where: { id: invoiceId, organizationId: user.organizationId } });
  if (!invoice) return;

  await db.invoice.update({ where: { id: invoice.id }, data: { status: "VOID", voidedAt: new Date() } });

  revalidatePath(`/jobs/${jobId}/invoices`);
}

/**
 * Explicit "Sync to QuickBooks" action (CLAUDE.md 2.3) — same pattern as Send to Budget
 * / Push to PO: a staff member triggers the push, rather than it happening silently in
 * the background. Every attempt is recorded in QboSyncLog regardless of outcome
 * (src/lib/quickbooks/sync-log.ts), so a failure here is visible and retryable, not lost.
 */
export async function syncInvoiceToQuickBooksAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireAppUser();

  const jobId = String(formData.get("jobId") ?? "");
  const invoiceId = String(formData.get("invoiceId") ?? "");

  try {
    await syncInvoiceToQuickBooks(user.organizationId, invoiceId);
  } catch (error) {
    if (
      error instanceof QuickBooksNotConfiguredError ||
      error instanceof QuickBooksNotConnectedError ||
      error instanceof InvoiceHasNoClientError ||
      error instanceof QuickBooksApiError
    ) {
      return { error: error.message };
    }
    throw error;
  }

  revalidatePath(`/jobs/${jobId}/invoices/${invoiceId}`);
  return { ok: true };
}
