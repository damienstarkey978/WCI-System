"use server";

import { redirect } from "next/navigation";

import { requireAppUser } from "@/lib/auth";
import { AiNotConfiguredError, JarvisReplyError } from "@/lib/jarvis/assistant";
import { ConversationNotFoundError, sendJarvisMessage } from "@/lib/jarvis/service";

export interface ActionState {
  readonly error?: string;
}

const INITIAL: ActionState = {};

export { INITIAL as initialJarvisActionState };

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
