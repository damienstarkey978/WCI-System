"use server";

import { revalidatePath } from "next/cache";

import { requireAppUser } from "@/lib/auth";
import { createMessageThread, MessageThreadNotFoundError, postThreadMessage } from "@/lib/messages/threads";

export interface ActionState {
  readonly error?: string;
  readonly ok?: boolean;
  readonly threadId?: string;
}

/** Posts a reply into a conversation ("general" is the pre-threads stream). */
export async function postJobMessageAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireAppUser();

  const jobId = String(formData.get("jobId") ?? "");
  const threadId = String(formData.get("threadId") ?? "general");
  const body = String(formData.get("body") ?? "").trim();
  if (!body) return { error: "Message can't be empty." };

  try {
    await postThreadMessage({ organizationId: user.organizationId, jobId, threadId, userId: user.id, body });
  } catch (error) {
    if (error instanceof MessageThreadNotFoundError || (error instanceof Error && error.message === "Job not found.")) return { error: error.message };
    throw error;
  }

  revalidatePath(`/jobs/${jobId}/messages`);
  return { ok: true };
}

export async function createThreadAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireAppUser();

  const jobId = String(formData.get("jobId") ?? "");
  try {
    const thread = await createMessageThread({
      organizationId: user.organizationId,
      jobId,
      userId: user.id,
      subject: String(formData.get("subject") ?? ""),
      body: String(formData.get("body") ?? ""),
    });
    revalidatePath(`/jobs/${jobId}/messages`);
    return { ok: true, threadId: thread.id };
  } catch (error) {
    if (error instanceof Error && ["Subject is required.", "Message can't be empty.", "Job not found."].includes(error.message)) return { error: error.message };
    throw error;
  }
}
