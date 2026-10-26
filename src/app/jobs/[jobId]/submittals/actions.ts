"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireAppUser } from "@/lib/auth";
import {
  addRevision,
  createSubmittal,
  issueReviewLink,
  JobNotFoundError,
  SubmittalNotFoundError,
  updateSubmittal,
  UserNotFoundError,
  VendorNotFoundError,
  type SubmittalTypeValue,
} from "@/lib/submittals/service";

export interface ActionState {
  readonly error?: string;
  readonly ok?: boolean;
  readonly reviewToken?: string;
}

const TYPES: readonly SubmittalTypeValue[] = ["MATERIAL_SPEC", "SHOP_DRAWING", "PRODUCT_DATA", "SAMPLE", "OTHER"];

function parseType(raw: string): SubmittalTypeValue {
  return TYPES.includes(raw as SubmittalTypeValue) ? (raw as SubmittalTypeValue) : "MATERIAL_SPEC";
}

export async function createSubmittalAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireAppUser();

  const jobId = String(formData.get("jobId") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  const type = parseType(String(formData.get("type") ?? "MATERIAL_SPEC"));
  const documentUrl = String(formData.get("documentUrl") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();
  const dueRaw = String(formData.get("finalDueDate") ?? "");

  if (!title) return { error: "Title is required." };

  try {
    const submittal = await createSubmittal({
      organizationId: user.organizationId,
      jobId,
      title,
      type,
      documentUrl: documentUrl || null,
      notes: notes || null,
      description: String(formData.get("description") ?? "").trim() || null,
      packageName: String(formData.get("packageName") ?? "").trim() || null,
      division: String(formData.get("division") ?? "").trim() || null,
      specSection: String(formData.get("specSection") ?? "").trim() || null,
      finalDueDate: dueRaw ? new Date(`${dueRaw}T00:00:00Z`) : null,
      managerUserId: String(formData.get("managerUserId") ?? "") || user.id,
      vendorId: String(formData.get("vendorId") ?? "") || null,
      status: documentUrl ? "PENDING" : "DRAFT",
    });
    revalidatePath(`/jobs/${jobId}/submittals`);
    redirect(`/jobs/${jobId}/submittals/${submittal.id}`);
  } catch (error) {
    if (
      error instanceof JobNotFoundError ||
      error instanceof UserNotFoundError ||
      error instanceof VendorNotFoundError
    ) {
      return { error: error.message };
    }
    throw error;
  }
}

export async function updateSubmittalAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireAppUser();
  const jobId = String(formData.get("jobId") ?? "");
  const submittalId = String(formData.get("submittalId") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  const dueRaw = String(formData.get("finalDueDate") ?? "");

  if (!title) return { error: "Title is required." };

  try {
    await updateSubmittal({
      organizationId: user.organizationId,
      submittalId,
      title,
      type: parseType(String(formData.get("type") ?? "MATERIAL_SPEC")),
      description: String(formData.get("description") ?? "").trim() || null,
      packageName: String(formData.get("packageName") ?? "").trim() || null,
      division: String(formData.get("division") ?? "").trim() || null,
      specSection: String(formData.get("specSection") ?? "").trim() || null,
      finalDueDate: dueRaw ? new Date(`${dueRaw}T00:00:00Z`) : null,
      managerUserId: String(formData.get("managerUserId") ?? "") || null,
      vendorId: String(formData.get("vendorId") ?? "") || null,
    });
  } catch (error) {
    if (
      error instanceof SubmittalNotFoundError ||
      error instanceof UserNotFoundError ||
      error instanceof VendorNotFoundError
    ) {
      return { error: error.message };
    }
    throw error;
  }

  revalidatePath(`/jobs/${jobId}/submittals`);
  revalidatePath(`/jobs/${jobId}/submittals/${submittalId}`);
  return { ok: true };
}

export async function addSubmittalRevisionAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireAppUser();
  const jobId = String(formData.get("jobId") ?? "");
  const submittalId = String(formData.get("submittalId") ?? "");
  const documentUrl = String(formData.get("documentUrl") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();

  if (!documentUrl) return { error: "A document link is required." };

  try {
    await addRevision(user.organizationId, submittalId, documentUrl, notes || null);
  } catch (error) {
    if (error instanceof SubmittalNotFoundError) return { error: error.message };
    throw error;
  }

  revalidatePath(`/jobs/${jobId}/submittals`);
  revalidatePath(`/jobs/${jobId}/submittals/${submittalId}`);
  return { ok: true };
}

export async function issueSubmittalReviewLinkAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireAppUser();
  const jobId = String(formData.get("jobId") ?? "");
  const submittalId = String(formData.get("submittalId") ?? "");
  const reviewerName = String(formData.get("reviewerName") ?? "").trim();
  const reviewerEmail = String(formData.get("reviewerEmail") ?? "").trim();

  if (!reviewerName) return { error: "Reviewer name is required." };
  if (!reviewerEmail) return { error: "Reviewer email is required." };

  try {
    const { token } = await issueReviewLink({
      organizationId: user.organizationId,
      submittalId,
      reviewerName,
      reviewerEmail,
    });
    revalidatePath(`/jobs/${jobId}/submittals`);
    revalidatePath(`/jobs/${jobId}/submittals/${submittalId}`);
    return { ok: true, reviewToken: token };
  } catch (error) {
    if (error instanceof SubmittalNotFoundError) return { error: error.message };
    throw error;
  }
}
