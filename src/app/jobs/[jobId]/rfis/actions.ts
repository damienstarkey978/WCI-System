"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireAppUser } from "@/lib/auth";
import {
  answerRfi,
  closeRfi,
  createRfi,
  JobNotFoundError,
  RfiAlreadyClosedError,
  RfiNotFoundError,
  updateRfi,
} from "@/lib/rfis/service";

export interface ActionState {
  readonly error?: string;
  readonly ok?: boolean;
}

export async function createRfiAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireAppUser();

  const jobId = String(formData.get("jobId") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  const question = String(formData.get("question") ?? "").trim();
  const dueDateRaw = String(formData.get("dueDate") ?? "");
  const assigneeUserId = String(formData.get("assigneeUserId") ?? "");
  const reminder = String(formData.get("reminder") ?? "").trim();
  const relatedItemRef = String(formData.get("relatedItemRef") ?? "").trim();

  if (!title) return { error: "Title is required." };
  if (!question) return { error: "Question is required." };
  if (!dueDateRaw) return { error: "Due date is required." };

  try {
    const rfi = await createRfi({
      organizationId: user.organizationId,
      jobId,
      title,
      question,
      dueDate: new Date(`${dueDateRaw}T00:00:00Z`),
      assigneeUserId: assigneeUserId || null,
      reminder: reminder && reminder !== "None" ? reminder : null,
      relatedItemRef: relatedItemRef || null,
    });
    revalidatePath(`/jobs/${jobId}/rfis`);
    redirect(`/jobs/${jobId}/rfis/${rfi.id}`);
  } catch (error) {
    if (error instanceof JobNotFoundError) return { error: error.message };
    throw error;
  }
}

export async function updateRfiAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireAppUser();
  const jobId = String(formData.get("jobId") ?? "");
  const rfiId = String(formData.get("rfiId") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  const question = String(formData.get("question") ?? "").trim();
  const dueDateRaw = String(formData.get("dueDate") ?? "");

  if (!title) return { error: "Title is required." };
  if (!question) return { error: "Question is required." };
  if (!dueDateRaw) return { error: "Due date is required." };

  const reminder = String(formData.get("reminder") ?? "").trim();

  try {
    await updateRfi({
      organizationId: user.organizationId,
      rfiId,
      title,
      question,
      dueDate: new Date(`${dueDateRaw}T00:00:00Z`),
      assigneeUserId: String(formData.get("assigneeUserId") ?? "") || null,
      reminder: reminder && reminder !== "None" ? reminder : null,
      relatedItemRef: String(formData.get("relatedItemRef") ?? "").trim() || null,
    });
  } catch (error) {
    if (error instanceof RfiNotFoundError || error instanceof RfiAlreadyClosedError) return { error: error.message };
    throw error;
  }

  revalidatePath(`/jobs/${jobId}/rfis`);
  revalidatePath(`/jobs/${jobId}/rfis/${rfiId}`);
  return { ok: true };
}

export async function answerRfiAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireAppUser();

  const jobId = String(formData.get("jobId") ?? "");
  const rfiId = String(formData.get("rfiId") ?? "");
  const answer = String(formData.get("answer") ?? "").trim();

  if (!answer) return { error: "Answer is required." };

  try {
    await answerRfi(user.organizationId, rfiId, answer);
  } catch (error) {
    if (error instanceof RfiNotFoundError || error instanceof RfiAlreadyClosedError) return { error: error.message };
    throw error;
  }

  revalidatePath(`/jobs/${jobId}/rfis`);
  revalidatePath(`/jobs/${jobId}/rfis/${rfiId}`);
  return { ok: true };
}

export async function closeRfiAction(formData: FormData): Promise<void> {
  const user = await requireAppUser();

  const jobId = String(formData.get("jobId") ?? "");
  const rfiId = String(formData.get("rfiId") ?? "");

  try {
    await closeRfi(user.organizationId, rfiId);
  } catch (error) {
    if (error instanceof RfiNotFoundError) return;
    throw error;
  }

  revalidatePath(`/jobs/${jobId}/rfis`);
  revalidatePath(`/jobs/${jobId}/rfis/${rfiId}`);
}
