"use server";

import { revalidatePath } from "next/cache";

import type { BillApprovalStatus } from "@/generated/prisma/enums";
import { requireAppUser } from "@/lib/auth";
import {
  ApprovalsIncompleteError,
  ApproverNotAssignedError,
  approveBillAs,
  claimFromInbox,
  setBillApprovers,
} from "@/lib/bills/intake";
import {
  LienWaiverAlreadyReleasedError,
  applyLienWaiver,
  releaseLienWaiver,
} from "@/lib/bills/lien-waivers";
import {
  BillAlreadyInvoicedError,
  BillNotBillableError,
  InvoiceNotEditableError,
  addBillToInvoice,
} from "@/lib/bills/to-invoice";
import { parsePercentToBasisPoints } from "@/lib/money";
import {
  BillNotEditableError,
  BillNotFoundError,
  BillQuickBooksIntentRequiredError,
  IllegalBillTransitionError,
  InventedBillNumberError,
  PurchaseOrderJobMismatchError,
  UnknownCostCodeError,
  UnknownPurchaseOrderError,
  UnknownVendorError,
  updateBill,
  updateBillStatus,
} from "@/lib/bills/service";
import { extendedCostCents } from "@/lib/budget/funnel";
import {
  BillNotFoundForFileError,
  JobNotFoundError as FileJobNotFoundError,
  uploadAndRegisterFile,
} from "@/lib/files/service";
import { parseCostCodeLineItems } from "@/lib/financial/parse-line-items";
import { NotDiscardableError, RecordNotFoundError, deleteBill } from "@/lib/financials/discard";
import { StorageNotConfiguredError } from "@/lib/storage/supabase-storage";

const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;

export interface BillActionState {
  readonly error?: string;
  readonly ok?: boolean;
}

function parseOptionalDate(raw: string): Date | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const date = new Date(`${trimmed}T12:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Every bill action funnels through here so the org scoping, the error translation,
 * and the revalidation are identical across all of them. The known service errors
 * become messages the office can act on; anything unrecognized still throws, since
 * swallowing an unexpected failure on a money screen is worse than a stack trace.
 */
async function run(
  jobId: string,
  billId: string,
  work: (organizationId: string, userId: string) => Promise<unknown>,
): Promise<BillActionState> {
  const user = await requireAppUser();
  try {
    await work(user.organizationId, user.id);
  } catch (error) {
    if (
      error instanceof BillNotFoundError ||
      error instanceof BillNotEditableError ||
      error instanceof InventedBillNumberError ||
      error instanceof UnknownCostCodeError ||
      error instanceof UnknownVendorError ||
      error instanceof UnknownPurchaseOrderError ||
      error instanceof PurchaseOrderJobMismatchError ||
      error instanceof IllegalBillTransitionError ||
      error instanceof BillQuickBooksIntentRequiredError ||
      error instanceof ApprovalsIncompleteError ||
      error instanceof ApproverNotAssignedError ||
      error instanceof LienWaiverAlreadyReleasedError ||
      error instanceof BillNotBillableError ||
      error instanceof BillAlreadyInvoicedError ||
      error instanceof InvoiceNotEditableError ||
      error instanceof NotDiscardableError ||
      error instanceof RecordNotFoundError
    ) {
      return { error: error.message };
    }
    if (error instanceof Error && error.message.includes("Cannot parse")) {
      return { error: error.message };
    }
    throw error;
  }
  revalidatePath(`/jobs/${jobId}/bills`);
  revalidatePath(`/jobs/${jobId}/bills/${billId}`);
  return { ok: true };
}

/** Save bill header + Pay to / PO + QuickBooks / billable (BT detail edit). */
export async function updateBillAction(_previous: BillActionState, formData: FormData): Promise<BillActionState> {
  const jobId = String(formData.get("jobId") ?? "");
  const billId = String(formData.get("billId") ?? "");
  const title = String(formData.get("title") ?? "").trim() || null;
  const billNumber = String(formData.get("billNumber") ?? "").trim() || null;
  const description = String(formData.get("description") ?? "").trim() || null;
  const issuedOn = parseOptionalDate(String(formData.get("issuedOn") ?? ""));
  const dueOn = parseOptionalDate(String(formData.get("dueOn") ?? ""));
  const vendorId = String(formData.get("vendorId") ?? "").trim() || null;
  const vendorName = String(formData.get("vendorName") ?? "").trim() || null;
  const purchaseOrderId = String(formData.get("purchaseOrderId") ?? "").trim() || null;
  const sendRaw = String(formData.get("sendToQuickBooks") ?? "").trim();
  const sendToQuickBooks = sendRaw === "true" ? true : sendRaw === "false" ? false : null;
  const billableToClient = String(formData.get("billableToClient") ?? "") === "true";
  const quickBooksSkipReason =
    sendToQuickBooks === false
      ? String(formData.get("quickBooksSkipReason") ?? "").trim() || "Skipped QuickBooks on save"
      : null;

  if (!vendorId && !vendorName) {
    return { error: "Pay to is required — pick a vendor or type a name." };
  }

  const hasCostLines = formData.getAll("lineCostCodeId").length > 0;
  let lineItems: Parameters<typeof updateBill>[0]["lineItems"];
  if (hasCostLines) {
    try {
      const parsed = parseCostCodeLineItems(formData);
      if (parsed.length === 0) return { error: "Add at least one line item." };
      lineItems = parsed.map((item) => ({
        costCodeId: item.costCodeId,
        title: item.title,
        amountCents: extendedCostCents(item.quantityMilli, item.unitCostCents),
        ...(item.costType ? { costType: item.costType } : {}),
      }));
    } catch (error) {
      if (error instanceof Error && error.message.includes("Cannot parse")) {
        return { error: error.message };
      }
      throw error;
    }
  }

  return run(jobId, billId, (organizationId) =>
    updateBill({
      organizationId,
      billId,
      title,
      billNumber,
      description,
      issuedOn,
      dueOn,
      vendorId,
      vendorName,
      purchaseOrderId,
      sendToQuickBooks,
      quickBooksSkipReason,
      billableToClient,
      ...(lineItems ? { lineItems } : {}),
    }),
  );
}

export async function setBillStatusAction(_previous: BillActionState, formData: FormData): Promise<BillActionState> {
  const jobId = String(formData.get("jobId") ?? "");
  const billId = String(formData.get("billId") ?? "");
  const status = String(formData.get("status") ?? "") as BillApprovalStatus;
  const sendRaw = String(formData.get("sendToQuickBooks") ?? "").trim();
  const skipReason = String(formData.get("quickBooksSkipReason") ?? "").trim() || null;

  const options =
    status === "READY_FOR_PAYMENT"
      ? {
          sendToQuickBooks: sendRaw === "true" ? true : sendRaw === "false" ? false : undefined,
          quickBooksSkipReason: skipReason,
        }
      : {};

  return run(jobId, billId, (organizationId) => updateBillStatus(organizationId, billId, status, options));
}

export async function claimFromInboxAction(_previous: BillActionState, formData: FormData): Promise<BillActionState> {
  const jobId = String(formData.get("jobId") ?? "");
  const billId = String(formData.get("billId") ?? "");
  return run(jobId, billId, (organizationId, userId) => claimFromInbox({ organizationId, billId, userId }));
}

export async function setApproversAction(_previous: BillActionState, formData: FormData): Promise<BillActionState> {
  const jobId = String(formData.get("jobId") ?? "");
  const billId = String(formData.get("billId") ?? "");
  const approverUserIds = formData.getAll("approverUserIds").map(String).filter(Boolean);
  return run(jobId, billId, (organizationId) => setBillApprovers({ organizationId, billId, approverUserIds }));
}

/** Sign off as the current user. Deliberately can't sign on someone else's behalf. */
export async function approveAsMeAction(_previous: BillActionState, formData: FormData): Promise<BillActionState> {
  const jobId = String(formData.get("jobId") ?? "");
  const billId = String(formData.get("billId") ?? "");
  const note = String(formData.get("note") ?? "").trim() || null;
  return run(jobId, billId, (organizationId, userId) =>
    approveBillAs({ organizationId, billId, approverUserId: userId, note }),
  );
}

export async function applyLienWaiverAction(_previous: BillActionState, formData: FormData): Promise<BillActionState> {
  const jobId = String(formData.get("jobId") ?? "");
  const billId = String(formData.get("billId") ?? "");
  const templateName = String(formData.get("templateName") ?? "");
  return run(jobId, billId, (organizationId) => applyLienWaiver({ organizationId, billId, templateName }));
}

export async function releaseLienWaiverAction(_previous: BillActionState, formData: FormData): Promise<BillActionState> {
  const jobId = String(formData.get("jobId") ?? "");
  const billId = String(formData.get("billId") ?? "");
  const lienWaiverId = String(formData.get("lienWaiverId") ?? "");
  return run(jobId, billId, (organizationId) => releaseLienWaiver({ organizationId, lienWaiverId }));
}

/**
 * Bill the vendor's cost to the client at a markup. Revalidates the invoices screen
 * too, since that is where the resulting draft shows up.
 */
/** Delete an inbox / in-review bill (BT footer Delete on Draft). */
export async function deleteBillAction(_previous: BillActionState, formData: FormData): Promise<BillActionState> {
  const jobId = String(formData.get("jobId") ?? "");
  const billId = String(formData.get("billId") ?? "");
  const state = await run(jobId, billId, (organizationId) => deleteBill(organizationId, billId));
  if (state.ok) {
    revalidatePath(`/jobs/${jobId}/bills`);
  }
  return state;
}

export async function addToInvoiceAction(_previous: BillActionState, formData: FormData): Promise<BillActionState> {
  const jobId = String(formData.get("jobId") ?? "");
  const billId = String(formData.get("billId") ?? "");
  const markupRaw = String(formData.get("markup") ?? "").trim();
  const invoiceId = String(formData.get("invoiceId") ?? "").trim();

  // An empty markup is refused rather than quietly meaning 0%. Billing a client at
  // cost is a legitimate choice, but it has to be a choice — "0" typed in, not a
  // field left blank.
  if (markupRaw === "") {
    return { error: "Enter a markup — type 0 to bill this at cost." };
  }

  const state = await run(jobId, billId, (organizationId) =>
    addBillToInvoice({
      organizationId,
      billId,
      markupBasisPoints: parsePercentToBasisPoints(markupRaw),
      invoiceId: invoiceId || null,
    }),
  );
  revalidatePath(`/jobs/${jobId}/invoices`);
  return state;
}

/** Attach receipts/invoices to an existing bill (BT Document rail Add). */
export async function attachBillFilesAction(
  _previous: BillActionState,
  formData: FormData,
): Promise<BillActionState> {
  const user = await requireAppUser();
  const jobId = String(formData.get("jobId") ?? "");
  const billId = String(formData.get("billId") ?? "");
  const files = formData.getAll("files").filter((entry): entry is File => entry instanceof File && entry.size > 0);
  if (files.length === 0) return { error: "Choose at least one file." };

  const totalBytes = files.reduce((total, file) => total + file.size, 0);
  if (totalBytes > MAX_ATTACHMENT_BYTES) {
    return { error: `Attachments are ${(totalBytes / 1024 / 1024).toFixed(1)}MB. Keep under 20MB.` };
  }

  try {
    for (const file of files) {
      const bytes = new Uint8Array(await file.arrayBuffer());
      await uploadAndRegisterFile({
        organizationId: user.organizationId,
        jobId,
        uploadedByUserId: user.id,
        fileName: file.name,
        bytes,
        mimeType: file.type || null,
        sizeBytes: file.size,
        category: "DOCUMENT",
        clientVisible: false,
        subVisible: true,
        billId,
      });
    }
  } catch (error) {
    if (
      error instanceof StorageNotConfiguredError ||
      error instanceof FileJobNotFoundError ||
      error instanceof BillNotFoundForFileError
    ) {
      return { error: error.message };
    }
    throw error;
  }

  revalidatePath(`/jobs/${jobId}/bills/${billId}`);
  revalidatePath(`/jobs/${jobId}/files`);
  return { ok: true };
}
