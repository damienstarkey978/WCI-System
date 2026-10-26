"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { requireAppUser } from "@/lib/auth";
import { AttachmentLimitError, assertAttachmentsWithinLimits } from "@/lib/jarvis/attachments";
import { AiNotConfiguredError, JarvisReplyError, type JarvisImageInput } from "@/lib/jarvis/assistant";
import {
  PendingActionNotFoundError,
  PendingActionNotPendingError,
  confirmPendingAction,
  declinePendingAction,
} from "@/lib/jarvis/pending-actions";
import { ConversationNotFoundError, getConversation, sendJarvisMessage } from "@/lib/jarvis/service";

export interface ActionState {
  readonly error?: string;
}

const ACCEPTED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

/** File-grounded Q&A (handoff-ai-analysis-and-jarvis-deep-integration-spec.md
 *  Part 3.4) — photos/screenshots attached to one message, vision input only. */
async function filesToImageInputs(formData: FormData, field: string): Promise<JarvisImageInput[]> {
  const files = formData.getAll(field).filter((value): value is File => value instanceof File && value.size > 0);

  // Checked before any file is read, not after: the point is to fail cheaply on a
  // batch that is too large, not to spend the work decoding it first. The client
  // compresses and pre-checks the same limits (src/lib/client/compress-image.ts,
  // JarvisChatPanel/ChatInputForm), so this is the backstop for a client that
  // skipped that step — a slow connection, an old cached page, a client this
  // server action didn't anticipate — never the first line of defense.
  assertAttachmentsWithinLimits(files.map((file) => file.size));

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

  if (!text) return { error: "Type a message first." };

  let images: JarvisImageInput[];
  try {
    images = await filesToImageInputs(formData, "attachments");
  } catch (error) {
    if (error instanceof AttachmentLimitError) return { error: error.message };
    throw error;
  }

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

export interface LauncherPendingActionData {
  readonly id: string;
  readonly summary: string;
  readonly status: "PENDING" | "CONFIRMED" | "DECLINED";
  readonly resultSummary: string | null;
  readonly createdAt: string;
}

export interface LauncherActionState {
  readonly error?: string;
  readonly conversationId?: string;
  readonly messages?: readonly LauncherMessageData[];
  readonly pendingActions?: readonly LauncherPendingActionData[];
  readonly pendingCount?: number;
}

function toLauncherState(conversation: {
  readonly id: string;
  readonly messages: readonly { id: string; role: "USER" | "ASSISTANT"; content: string; createdAt: Date }[];
  readonly pendingActions: readonly {
    id: string;
    summary: string;
    status: "PENDING" | "CONFIRMED" | "DECLINED";
    resultSummary: string | null;
    createdAt: Date;
  }[];
}): LauncherActionState {
  const pendingActions = conversation.pendingActions.map((action) => ({
    id: action.id,
    summary: action.summary,
    status: action.status,
    resultSummary: action.resultSummary,
    createdAt: action.createdAt.toISOString(),
  }));
  return {
    conversationId: conversation.id,
    messages: conversation.messages.map((message) => ({
      id: message.id,
      role: message.role,
      content: message.content,
      createdAt: message.createdAt.toISOString(),
    })),
    pendingActions,
    pendingCount: pendingActions.filter((action) => action.status === "PENDING").length,
  };
}

/**
 * The docked-launcher counterpart to sendJarvisMessageAction (src/components/jarvis/
 * JarvisLauncher.tsx) — same underlying sendJarvisMessage call, but returns the
 * conversation as data instead of redirecting, since the launcher is a panel over
 * whatever page the user was already on, not a destination. Pending confirm cards
 * are returned here too so the embedded panel can Confirm/Decline without forcing
 * a trip to the full /jarvis page (Handy-style stay-on-page flow).
 */
export async function sendJarvisLauncherMessageAction(_previous: LauncherActionState, formData: FormData): Promise<LauncherActionState> {
  const user = await requireAppUser();

  const text = String(formData.get("text") ?? "").trim();
  const conversationId = String(formData.get("conversationId") ?? "") || undefined;
  const contextRaw = String(formData.get("context") ?? "");

  if (!text) return { error: "Type a message first.", conversationId };

  let images: JarvisImageInput[];
  try {
    images = await filesToImageInputs(formData, "attachments");
  } catch (error) {
    if (error instanceof AttachmentLimitError) return { error: error.message, conversationId };
    throw error;
  }

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
    return toLauncherState(conversation);
  } catch (error) {
    if (error instanceof AiNotConfiguredError) return { error: "Jarvis isn't configured yet — set ANTHROPIC_API_KEY in .env.", conversationId };
    if (error instanceof ConversationNotFoundError || error instanceof JarvisReplyError) return { error: error.message, conversationId };
    throw error;
  }
}

/**
 * Re-read an embedded conversation (messages + pending actions) without sending —
 * used to pick up async draft_lead_proposal worker replies and after Confirm/Decline.
 */
export async function refreshJarvisLauncherConversationAction(conversationId: string): Promise<LauncherActionState> {
  const user = await requireAppUser();
  try {
    const conversation = await getConversation(user.organizationId, user.id, conversationId);
    return toLauncherState(conversation);
  } catch (error) {
    if (error instanceof ConversationNotFoundError) return { error: error.message, conversationId };
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

/** Embedded-panel Confirm — returns refreshed launcher state instead of relying on a full-page revalidate. */
export async function confirmPendingActionLauncherAction(
  previous: LauncherActionState,
  formData: FormData,
): Promise<LauncherActionState> {
  const user = await requireAppUser();
  const conversationId = String(formData.get("conversationId") ?? "") || previous.conversationId;
  const actionId = String(formData.get("actionId") ?? "");
  if (!conversationId || !actionId) return { ...previous, error: "Missing confirmation details." };

  try {
    await confirmPendingAction(user.organizationId, actionId, user.role);
  } catch (error) {
    if (!(error instanceof PendingActionNotFoundError) && !(error instanceof PendingActionNotPendingError)) throw error;
  }

  revalidatePath(`/jarvis/${conversationId}`);
  return refreshJarvisLauncherConversationAction(conversationId);
}

/** Embedded-panel Decline — same shape as confirmPendingActionLauncherAction. */
export async function declinePendingActionLauncherAction(
  previous: LauncherActionState,
  formData: FormData,
): Promise<LauncherActionState> {
  const user = await requireAppUser();
  const conversationId = String(formData.get("conversationId") ?? "") || previous.conversationId;
  const actionId = String(formData.get("actionId") ?? "");
  if (!conversationId || !actionId) return { ...previous, error: "Missing decline details." };

  try {
    await declinePendingAction(user.organizationId, actionId);
  } catch (error) {
    if (!(error instanceof PendingActionNotFoundError) && !(error instanceof PendingActionNotPendingError)) throw error;
  }

  revalidatePath(`/jarvis/${conversationId}`);
  return refreshJarvisLauncherConversationAction(conversationId);
}
