"use server";

import { revalidatePath } from "next/cache";

import { requireAppUser } from "@/lib/auth";
import {
  acceptBidSubmission,
  BidSubmissionAlreadyDecidedError,
  BidSubmissionNotFoundError,
  BidSubmissionNotSubmittedError,
  createBidPackage,
  declineBidSubmission,
  JobNotFoundError,
} from "@/lib/bids/service";

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
