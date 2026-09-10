"use server";

import { revalidatePath } from "next/cache";

import { requireAppUser } from "@/lib/auth";
import {
  acceptBidSubmission,
  addBidPackageLineItems,
  AlreadyInvitedError,
  BidPackageHasNoScopeError,
  BidPackageNotDraftError,
  BidPackageNotFoundError,
  BidPackageNotOpenError,
  BidSubmissionAlreadyDecidedError,
  BidSubmissionLockedError,
  BidSubmissionNotFoundError,
  BidSubmissionNotSubmittedError,
  createBidPackage,
  declineBidSubmission,
  inviteVendorToBid,
  JobNotFoundError,
  releaseBidPackage,
  submitBid,
  VendorNotFoundError,
} from "@/lib/bids/service";
import { parseDollarsToCents } from "@/lib/money";

export interface ActionState {
  readonly error?: string;
  readonly ok?: boolean;
}

export async function createBidPackageAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireAppUser();

  const jobId = String(formData.get("jobId") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const dueDateRaw = String(formData.get("dueDate") ?? "");

  if (!title) return { error: "Title is required." };

  // Two submit buttons post the same form; which one was pressed decides whether
  // this goes straight out to subs or stays an internal draft.
  const release = String(formData.get("intent") ?? "") === "release";

  const scopeTitles = formData.getAll("scopeTitle").map(String);
  const scopeQuantities = formData.getAll("scopeQuantity").map(String);
  const scopeUnits = formData.getAll("scopeUnit").map(String);
  const lineItems = scopeTitles
    .map((scopeTitle, index) => ({
      title: scopeTitle.trim(),
      quantity: scopeQuantities[index] ?? "",
      unit: (scopeUnits[index] ?? "").trim(),
    }))
    .filter((line) => line.title)
    .map((line) => ({
      title: line.title,
      quantityMilli: line.quantity ? Math.round(Number.parseFloat(line.quantity) * 1000) : null,
      unit: line.unit || null,
    }));

  if (release && lineItems.length === 0) {
    return { error: "Add at least one scope line before releasing this to subs, or save it as a draft." };
  }

  try {
    await createBidPackage({
      organizationId: user.organizationId,
      jobId,
      title,
      description: description || null,
      dueDate: dueDateRaw ? new Date(dueDateRaw) : null,
      status: release ? "OPEN" : "DRAFT",
      lineItems,
    });
  } catch (error) {
    if (error instanceof JobNotFoundError) return { error: error.message };
    throw error;
  }

  revalidatePath(`/jobs/${jobId}/bids`);
  return { ok: true };
}

export async function inviteVendorToBidAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireAppUser();

  const jobId = String(formData.get("jobId") ?? "");
  const bidPackageId = String(formData.get("bidPackageId") ?? "");
  const vendorId = String(formData.get("vendorId") ?? "");

  if (!vendorId) return { error: "Choose a vendor." };

  try {
    await inviteVendorToBid(user.organizationId, bidPackageId, vendorId);
  } catch (error) {
    if (
      error instanceof BidPackageNotFoundError ||
      error instanceof BidPackageNotOpenError ||
      error instanceof VendorNotFoundError ||
      error instanceof AlreadyInvitedError
    ) {
      return { error: error.message };
    }
    throw error;
  }

  revalidatePath(`/jobs/${jobId}/bids`);
  return { ok: true };
}

export async function submitBidOnBehalfAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireAppUser();

  const jobId = String(formData.get("jobId") ?? "");
  const bidSubmissionId = String(formData.get("bidSubmissionId") ?? "");
  const amountRaw = String(formData.get("amount") ?? "");
  const notes = String(formData.get("notes") ?? "").trim();

  if (!amountRaw) return { error: "Amount is required." };

  try {
    const totalCents = parseDollarsToCents(amountRaw);
    await submitBid({
      organizationId: user.organizationId,
      bidSubmissionId,
      asStaff: true,
      totalCents,
      notes: notes || null,
    });
  } catch (error) {
    if (
      error instanceof BidSubmissionNotFoundError ||
      error instanceof BidSubmissionLockedError ||
      error instanceof BidSubmissionAlreadyDecidedError
    ) {
      return { error: error.message };
    }
    if (error instanceof Error && error.message.includes("Cannot parse")) return { error: error.message };
    throw error;
  }

  revalidatePath(`/jobs/${jobId}/bids`);
  return { ok: true };
}

export async function acceptBidSubmissionAction(formData: FormData): Promise<void> {
  const user = await requireAppUser();

  const jobId = String(formData.get("jobId") ?? "");
  const bidSubmissionId = String(formData.get("bidSubmissionId") ?? "");

  try {
    await acceptBidSubmission(user.organizationId, bidSubmissionId);
  } catch (error) {
    if (
      error instanceof BidSubmissionNotFoundError ||
      error instanceof BidSubmissionAlreadyDecidedError ||
      error instanceof BidSubmissionNotSubmittedError
    ) {
      return;
    }
    throw error;
  }

  revalidatePath(`/jobs/${jobId}/bids`);
}

export async function declineBidSubmissionAction(formData: FormData): Promise<void> {
  const user = await requireAppUser();

  const jobId = String(formData.get("jobId") ?? "");
  const bidSubmissionId = String(formData.get("bidSubmissionId") ?? "");

  try {
    await declineBidSubmission(user.organizationId, bidSubmissionId);
  } catch (error) {
    if (error instanceof BidSubmissionNotFoundError || error instanceof BidSubmissionAlreadyDecidedError) return;
    throw error;
  }

  revalidatePath(`/jobs/${jobId}/bids`);
}

export async function releaseBidPackageAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireAppUser();
  const jobId = String(formData.get("jobId") ?? "");
  const bidPackageId = String(formData.get("bidPackageId") ?? "");

  try {
    await releaseBidPackage(user.organizationId, bidPackageId);
  } catch (error) {
    if (
      error instanceof BidPackageNotFoundError ||
      error instanceof BidPackageNotDraftError ||
      error instanceof BidPackageHasNoScopeError
    ) {
      return { error: error.message };
    }
    throw error;
  }

  revalidatePath(`/jobs/${jobId}/bids`);
  return { ok: true };
}

/** Add scope lines to a draft package. The service refuses once it has been released. */
export async function addScopeLineAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireAppUser();
  const jobId = String(formData.get("jobId") ?? "");
  const bidPackageId = String(formData.get("bidPackageId") ?? "");
  const title = String(formData.get("scopeTitle") ?? "").trim();
  const quantityRaw = String(formData.get("scopeQuantity") ?? "").trim();
  const unit = String(formData.get("scopeUnit") ?? "").trim();

  if (!title) return { error: "Describe what the sub is pricing." };

  try {
    await addBidPackageLineItems({
      organizationId: user.organizationId,
      bidPackageId,
      lineItems: [
        {
          title,
          quantityMilli: quantityRaw ? Math.round(Number.parseFloat(quantityRaw) * 1000) : null,
          unit: unit || null,
        },
      ],
    });
  } catch (error) {
    if (error instanceof BidPackageNotFoundError || error instanceof BidPackageNotDraftError) {
      return { error: error.message };
    }
    throw error;
  }

  revalidatePath(`/jobs/${jobId}/bids`);
  return { ok: true };
}
