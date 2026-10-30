"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";

import { AiNotConfiguredError, DailyLogDraftError, draftDailyLogNote, type DailyLogImageInput } from "@/lib/ai/daily-log-assistant";
import { requireAppUser } from "@/lib/auth";
import { createComment } from "@/lib/comments/service";
import { createDailyLog, DailyLogAuthorRequiredError, JobNotFoundError, toggleDailyLogLike } from "@/lib/daily-logs/service";
import { uploadAndRegisterFile } from "@/lib/files/service";
import { StorageNotConfiguredError } from "@/lib/storage/supabase-storage";

/**
 * Revalidate staff daily-log views *after* the Server Action response is sent.
 *
 * Calling `revalidatePath` inline made Next fold a full RSC refresh of the
 * force-dynamic list page (batch-signing every photo URL) into the action
 * response. On jobs with a big gallery that refresh can exceed the serverless
 * function window; the platform then returns HTML/empty and the browser shows
 * "An unexpected response was received from the server" even though the log
 * row already committed. The form already calls `router.refresh()` on success.
 */
function revalidateDailyLogViews(jobId: string, logId?: string) {
  after(() => {
    revalidatePath(`/jobs/${jobId}/daily-logs`);
    revalidatePath(`/jobs/${jobId}`);
    if (logId) revalidatePath(`/jobs/${jobId}/daily-logs/${logId}`);
  });
}

export interface ActionState {
  readonly error?: string;
  readonly ok?: boolean;
}

const ACCEPTED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

export interface DraftDailyLogActionState {
  readonly error?: string;
  readonly draft?: string;
}

/**
 * "Draft with AI" (handoff-ai-analysis-and-jarvis-deep-integration-spec.md Part
 * 3.3a) — turns a rough note + optional photos into a drafted log entry the human
 * reviews in the textarea before submitting the real createDailyLogAction. Never
 * creates a DailyLog row itself, and the photos here are vision input only, not
 * persisted as job files — same scope as the form's existing (photo-less) note field.
 */
export async function draftDailyLogNoteAction(_previous: DraftDailyLogActionState, formData: FormData): Promise<DraftDailyLogActionState> {
  await requireAppUser();

  const notes = String(formData.get("notes") ?? "").trim();
  if (notes.length < 5) return { error: "Jot at least a few words about what happened first." };

  const files = formData.getAll("photos").filter((value): value is File => value instanceof File && value.size > 0);
  const images: DailyLogImageInput[] = [];
  for (const file of files) {
    if (!ACCEPTED_IMAGE_TYPES.has(file.type)) continue;
    const buffer = Buffer.from(await file.arrayBuffer());
    images.push({ base64Data: buffer.toString("base64"), mediaType: file.type as DailyLogImageInput["mediaType"] });
  }

  try {
    const draft = await draftDailyLogNote({ notes, images });
    return { draft };
  } catch (error) {
    if (error instanceof AiNotConfiguredError) return { error: "The AI assistant isn't configured yet — set ANTHROPIC_API_KEY in .env." };
    if (error instanceof DailyLogDraftError) return { error: error.message };
    throw error;
  }
}

export async function createDailyLogAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const jobId = String(formData.get("jobId") ?? "");
  const note = String(formData.get("note") ?? "").trim();
  const title = String(formData.get("title") ?? "").trim();
  const clientVisible = formData.get("clientVisible") === "on";
  const subVisible = formData.get("subVisible") === "on";

  if (!note) {
    return { error: "Note is required." };
  }

  const attachments = formData.getAll("attachments").filter((entry): entry is File => entry instanceof File && entry.size > 0);

  try {
    const user = await requireAppUser();
    const log = await createDailyLog({
      organizationId: user.organizationId,
      jobId,
      authorUserId: user.id,
      title,
      note,
      clientVisible,
      subVisible,
    });

    // Photos and videos ride with the log and share its visibility; anything else is a document.
    for (const file of attachments) {
      const category = file.type.startsWith("image/") ? "PHOTO" : file.type.startsWith("video/") ? "VIDEO" : "DOCUMENT";
      await uploadAndRegisterFile({
        organizationId: user.organizationId,
        jobId,
        uploadedByUserId: user.id,
        fileName: file.name,
        bytes: new Uint8Array(await file.arrayBuffer()),
        mimeType: file.type || null,
        sizeBytes: file.size,
        category,
        clientVisible,
        subVisible,
        dailyLogId: log.id,
      });
    }

    revalidateDailyLogViews(jobId);
    return { ok: true };
  } catch (error) {
    if (
      error instanceof JobNotFoundError ||
      error instanceof StorageNotConfiguredError ||
      error instanceof DailyLogAuthorRequiredError
    ) {
      return { error: error.message };
    }
    // Surface unexpected failures so the client pending state always clears
    // instead of leaving "Saving…" stuck with no message — and instead of
    // letting an uncaught throw turn into Next's opaque "unexpected response".
    return { error: error instanceof Error ? error.message : "Could not save the daily log." };
  }
}

export async function toggleDailyLogLikeAction(formData: FormData): Promise<void> {
  const jobId = String(formData.get("jobId") ?? "");
  try {
    const user = await requireAppUser();
    await toggleDailyLogLike(user.organizationId, String(formData.get("logId") ?? ""), user.id);
  } catch {
    // A log deleted underneath the click just refreshes the page.
  }
  if (jobId) revalidateDailyLogViews(jobId);
}

export async function addDailyLogCommentAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const jobId = String(formData.get("jobId") ?? "");
  const logId = String(formData.get("logId") ?? "");
  const body = String(formData.get("body") ?? "").trim();
  if (!body) return { error: "Write a comment first." };

  try {
    const user = await requireAppUser();
    await createComment({
      organizationId: user.organizationId,
      featureType: "DailyLog",
      featureId: logId,
      authorUserId: user.id,
      body,
    });
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not post the comment." };
  }

  revalidateDailyLogViews(jobId, logId);
  return { ok: true };
}
