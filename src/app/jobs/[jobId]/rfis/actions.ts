"use server";

import { revalidatePath } from "next/cache";

import { requireAppUser } from "@/lib/auth";
import { answerRfi, closeRfi, createRfi, JobNotFoundError, RfiAlreadyClosedError, RfiNotFoundError } from "@/lib/rfis/service";

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

  if (!title) return { error: "Title is required." };
  if (!question) return { error: "Question is required." };

  try {
    await createRfi({
      organizationId: user.organizationId,
      jobId,
      title,
      question,
      dueDate: dueDateRaw ? new Date(dueDateRaw) : null,
      assigneeUserId: assigneeUserId || null,
    });
  } catch (error) {
    if (error instanceof JobNotFoundError) return { error: error.message };
    throw error;
  }

  revalidatePath(`/jobs/${jobId}/rfis`);
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
}
