"use server";

import { revalidatePath } from "next/cache";

import { requireAppUser } from "@/lib/auth";
import {
  acceptBidSubmission,
  AlreadyInvitedError,
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

  try {
    await createBidPackage({
      organizationId: user.organizationId,
      jobId,
      title,
      description: description || null,
      dueDate: dueDateRaw ? new Date(dueDateRaw) : null,
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
