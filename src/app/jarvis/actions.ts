"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { requireAppUser } from "@/lib/auth";
import { AiNotConfiguredError, JarvisReplyError } from "@/lib/jarvis/assistant";
import {
  PendingActionNotFoundError,
  PendingActionNotPendingError,
  confirmPendingAction,
  declinePendingAction,
} from "@/lib/jarvis/pending-actions";
import { ConversationNotFoundError, sendJarvisMessage } from "@/lib/jarvis/service";

export interface ActionState {
  readonly error?: string;
}

export async function sendJarvisMessageAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireAppUser();

  const text = String(formData.get("text") ?? "").trim();
  const conversationId = String(formData.get("conversationId") ?? "") || undefined;

  if (!text) return { error: "Type a message first." };

  let resultConversationId: string;
  try {
    const conversation = await sendJarvisMessage({ organizationId: user.organizationId, userId: user.id, conversationId, text });
    resultConversationId = conversation.id;
  } catch (error) {
    if (error instanceof AiNotConfiguredError) return { error: "Jarvis isn't configured yet — set ANTHROPIC_API_KEY in .env." };
    if (error instanceof ConversationNotFoundError || error instanceof JarvisReplyError) return { error: error.message };
    throw error;
  }

  redirect(`/jarvis/${resultConversationId}`);
}

export async function confirmPendingActionAction(formData: FormData): Promise<void> {
  const user = await requireAppUser();

  const conversationId = String(formData.get("conversationId") ?? "");
  const actionId = String(formData.get("actionId") ?? "");

  try {
    await confirmPendingAction(user.organizationId, actionId);
  } catch (error) {
    if (!(error instanceof PendingActionNotFoundError) && !(error instanceof PendingActionNotPendingError)) throw error;
  }

  revalidatePath(`/jarvis/${conversationId}`);
}

export async function declinePendingActionAction(formData: FormData): Promise<void> {
  const user = await requireAppUser();

  const conversationId = String(formData.get("conversationId") ?? "");
  const actionId = String(formData.get("actionId") ?? "");

  try {
    await declinePendingAction(user.organizationId, actionId);
  } catch (error) {
    if (!(error instanceof PendingActionNotFoundError) && !(error instanceof PendingActionNotPendingError)) throw error;
  }

  revalidatePath(`/jarvis/${conversationId}`);
}
