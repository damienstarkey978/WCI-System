"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { requireAppUser } from "@/lib/auth";
import { AiNotConfiguredError, JarvisReplyError, type JarvisImageInput } from "@/lib/jarvis/assistant";
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

const ACCEPTED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

/** File-grounded Q&A (handoff-ai-analysis-and-jarvis-deep-integration-spec.md
 *  Part 3.4) — photos/screenshots attached to one message, vision input only. */
async function filesToImageInputs(formData: FormData, field: string): Promise<JarvisImageInput[]> {
  const files = formData.getAll(field).filter((value): value is File => value instanceof File && value.size > 0);
  const images: JarvisImageInput[] = [];
  for (const file of files) {
    if (!ACCEPTED_IMAGE_TYPES.has(file.type)) continue;
    const buffer = Buffer.from(await file.arrayBuffer());
    images.push({ base64Data: buffer.toString("base64"), mediaType: file.type as JarvisImageInput["mediaType"] });
  }
  return images;
}

export async function sendJarvisMessageAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireAppUser();

  const text = String(formData.get("text") ?? "").trim();
  const conversationId = String(formData.get("conversationId") ?? "") || undefined;
  const images = await filesToImageInputs(formData, "attachments");

  if (!text) return { error: "Type a message first." };

  let resultConversationId: string;
  try {
    const conversation = await sendJarvisMessage({ organizationId: user.organizationId, userId: user.id, conversationId, text, images });
    resultConversationId = conversation.id;
  } catch (error) {
    if (error instanceof AiNotConfiguredError) return { error: "Jarvis isn't configured yet — set ANTHROPIC_API_KEY in .env." };
    if (error instanceof ConversationNotFoundError || error instanceof JarvisReplyError) return { error: error.message };
    throw error;
  }

  redirect(`/jarvis/${resultConversationId}`);
}

export interface LauncherMessageData {
  readonly id: string;
  readonly role: "USER" | "ASSISTANT";
  readonly content: string;
  readonly createdAt: string;
}

export interface LauncherActionState {
  readonly error?: string;
  readonly conversationId?: string;
  readonly messages?: readonly LauncherMessageData[];
  readonly pendingCount?: number;
}

/**
 * The docked-launcher counterpart to sendJarvisMessageAction (src/components/jarvis/
 * JarvisLauncher.tsx) — same underlying sendJarvisMessage call, but returns the
 * conversation as data instead of redirecting, since the launcher is a panel over
 * whatever page the user was already on, not a destination. Confirming/declining a
 * queued action still only happens on the full /jarvis/[conversationId] page — this
 * only reports how many are waiting.
 */
export async function sendJarvisLauncherMessageAction(_previous: LauncherActionState, formData: FormData): Promise<LauncherActionState> {
  const user = await requireAppUser();

  const text = String(formData.get("text") ?? "").trim();
  const conversationId = String(formData.get("conversationId") ?? "") || undefined;
  const contextRaw = String(formData.get("context") ?? "");
  const images = await filesToImageInputs(formData, "attachments");

  if (!text) return { error: "Type a message first.", conversationId };

  let context: unknown;
  if (contextRaw) {
    try {
      context = JSON.parse(contextRaw);
    } catch {
      context = undefined;
    }
  }

  try {
    const conversation = await sendJarvisMessage({ organizationId: user.organizationId, userId: user.id, conversationId, text, context, images });
    revalidatePath("/jarvis");
    revalidatePath(`/jarvis/${conversation.id}`);
    return {
      conversationId: conversation.id,
      messages: conversation.messages.map((message) => ({
        id: message.id,
        role: message.role,
        content: message.content,
        createdAt: message.createdAt.toISOString(),
      })),
      pendingCount: conversation.pendingActions.filter((action) => action.status === "PENDING").length,
    };
  } catch (error) {
    if (error instanceof AiNotConfiguredError) return { error: "Jarvis isn't configured yet — set ANTHROPIC_API_KEY in .env.", conversationId };
    if (error instanceof ConversationNotFoundError || error instanceof JarvisReplyError) return { error: error.message, conversationId };
    throw error;
  }
}

export async function confirmPendingActionAction(formData: FormData): Promise<void> {
  const user = await requireAppUser();

  const conversationId = String(formData.get("conversationId") ?? "");
  const actionId = String(formData.get("actionId") ?? "");

  try {
    await confirmPendingAction(user.organizationId, actionId, user.role);
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
