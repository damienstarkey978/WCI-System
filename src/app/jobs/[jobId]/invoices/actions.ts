"use server";

import { revalidatePath } from "next/cache";

import type { PaymentMethod, PaymentTerms } from "@/generated/prisma/enums";
import { InvoiceType } from "@/generated/prisma/enums";
import { requireAppUser } from "@/lib/auth";
import { displayInvoiceId } from "@/lib/invoicing/display";
import {
  createInvoice,
  InvoiceNotFoundError,
  InvoiceVoidedError,
  JobNotFoundError,
  JobNotOpenError,
  recordPayment,
  sendInvoice,
} from "@/lib/invoicing/service";
import { parseDollarsToCents, parsePercentToBasisPoints } from "@/lib/money";
import { db } from "@/lib/db";
import { QuickBooksApiError, QuickBooksNotConfiguredError } from "@/lib/quickbooks/client";
import { QuickBooksNotConnectedError } from "@/lib/quickbooks/connection-service";
import { InvoiceHasNoClientError, syncInvoiceToQuickBooks } from "@/lib/quickbooks/sync/invoices";

export interface ActionState {
  readonly error?: string;
  readonly ok?: boolean;
  readonly invoiceId?: string;
}

const PAYMENT_TERMS_VALUES = new Set<string>([
  "DUE_ON_RECEIPT",
  "NET_15",
  "NET_30",
  "NET_45",
  "NET_60",
  "CUSTOM",
]);

/** Next short display id for the job (0001, 0002, …) — matches BT “(Auto assign)”. */
async function nextAutoInvoiceNumber(organizationId: string, jobId: string): Promise<string> {
  const existing = await db.invoice.findMany({
    where: { organizationId, jobId },
    select: { invoiceNumber: true },
  });
  let max = 0;
  for (const row of existing) {
    const display = displayInvoiceId(row.invoiceNumber);
    const match = display.match(/(\d+)\s*$/);
    if (!match) continue;
    const value = Number.parseInt(match[1]!, 10);
    if (Number.isFinite(value) && value > max) max = value;
  }
  return String(max + 1).padStart(4, "0");
}

export async function createInvoiceAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireAppUser();

  const jobId = String(formData.get("jobId") ?? "");
  let invoiceNumber = String(formData.get("invoiceNumber") ?? "").trim();
  const title = String(formData.get("title") ?? "").trim() || null;
  const typeRaw = String(formData.get("type") ?? "FLAT");
  const type = typeRaw === "LINE_ITEM" ? InvoiceType.LINE_ITEM : InvoiceType.FLAT;
  const dueOnRaw = String(formData.get("dueOn") ?? "");
  const issuedOnRaw = String(formData.get("issuedOn") ?? "");
  const clientMessage = String(formData.get("clientMessage") ?? "").trim() || null;
  const intent = String(formData.get("intent") ?? "save") === "send" ? "send" : "save";
  const termsRaw = String(formData.get("paymentTerms") ?? "CUSTOM");
  const paymentTerms = (PAYMENT_TERMS_VALUES.has(termsRaw) ? termsRaw : "CUSTOM") as PaymentTerms;
  const invoiceToQbo = String(formData.get("invoiceToQbo") ?? "") === "1";

  if (!invoiceNumber) {
    invoiceNumber = await nextAutoInvoiceNumber(user.organizationId, jobId);
  }

  let invoiceId: string;
  try {
    if (type === InvoiceType.FLAT) {
      const amountRaw = String(formData.get("amount") ?? "0").trim() || "0";
      const amountCents = parseDollarsToCents(amountRaw);

      const invoice = await createInvoice({
        organizationId: user.organizationId,
        jobId,
        type,
        invoiceNumber,
        title,
        issuedOn: issuedOnRaw ? new Date(issuedOnRaw) : null,
        dueOn: dueOnRaw ? new Date(dueOnRaw) : null,
        paymentTerms,
        clientMessage,
        amountCents,
      });
      invoiceId = invoice.id;
    } else {
      const titles = formData.getAll("lineItemTitle").map(String);
      const amounts = formData.getAll("lineItemAmount").map(String);
      const keys = formData.getAll("lineItemKey").map(String);
      // Checkboxes submit their row key only when ticked, so they are matched by key
      // rather than by position — an unticked box submits nothing and would otherwise
      // shift every taxable flag onto the wrong line.
      const taxableKeys = new Set(formData.getAll("lineItemTaxable").map(String));

      const lineItems = titles
        .map((lineTitle, index) => ({
          title: lineTitle.trim(),
          amountRaw: amounts[index] ?? "",
          taxable: taxableKeys.has(keys[index] ?? ""),
        }))
        .filter((line) => line.title && line.amountRaw)
        .map((line) => ({
          title: line.title,
          amountCents: parseDollarsToCents(line.amountRaw),
          taxable: line.taxable,
        }));

      if (lineItems.length === 0) {
        return { error: "Add at least one line item with a title and amount." };
      }

      const taxRateRaw = String(formData.get("taxRate") ?? "").trim();
      const taxRateBasisPoints = taxRateRaw ? parsePercentToBasisPoints(taxRateRaw) : 0;
      if (taxRateBasisPoints > 0 && !lineItems.some((line) => line.taxable)) {
        return { error: "A tax rate is set but no line is marked taxable. Tick Tax on the lines it applies to." };
      }

      const invoice = await createInvoice({
        organizationId: user.organizationId,
        jobId,
        type,
        invoiceNumber,
        title,
        issuedOn: issuedOnRaw ? new Date(issuedOnRaw) : null,
        dueOn: dueOnRaw ? new Date(dueOnRaw) : null,
        paymentTerms,
        clientMessage,
        taxRateBasisPoints,
        lineItems,
      });
      invoiceId = invoice.id;
    }

    if (intent === "send") {
      await sendInvoice(user.organizationId, invoiceId);
      if (invoiceToQbo) {
        try {
          await syncInvoiceToQuickBooks(user.organizationId, invoiceId);
        } catch (error) {
          // Create + send already succeeded — QB is best-effort on Send (BT toggle).
          if (
            !(error instanceof QuickBooksNotConnectedError) &&
            !(error instanceof QuickBooksNotConfiguredError) &&
            !(error instanceof InvoiceHasNoClientError) &&
            !(error instanceof QuickBooksApiError)
          ) {
            throw error;
          }
        }
      }
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
  revalidatePath(`/jobs/${jobId}/invoices/${invoiceId}`);
  return { ok: true, invoiceId };
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
