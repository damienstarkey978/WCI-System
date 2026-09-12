"use client";

/**
 * Shared by both Jarvis composers (src/app/jarvis/chat-input-form.tsx,
 * src/components/jarvis/JarvisChatPanel.tsx) so compressing and validating attached
 * photos happens exactly once, the same way, in both places a message can be sent.
 */

import { compressImageFiles } from "@/lib/client/compress-image";
import { attachmentLimitReason, MAX_ATTACHMENT_COUNT } from "@/lib/jarvis/attachments";

export interface PreparedAttachments {
  readonly formData: FormData;
  /** Set when the batch can't be sent even after compression — the caller should show
   *  this instead of submitting, rather than letting the server round-trip just to
   *  say the same thing. */
  readonly error: string | null;
}

/**
 * Replaces the "attachments" entries in `formData` with compressed versions, in
 * place, and returns it. Bails out before spending time compressing anything if the
 * raw file *count* alone is already over the limit — a person who picked 80 photos
 * doesn't need to wait through compressing all of them to be told to pick fewer.
 */
export async function prepareJarvisAttachments(formData: FormData): Promise<PreparedAttachments> {
  const rawFiles = formData.getAll("attachments").filter((value): value is File => value instanceof File && value.size > 0);
  if (rawFiles.length === 0) return { formData, error: null };

  if (rawFiles.length > MAX_ATTACHMENT_COUNT) {
    return { formData, error: attachmentLimitReason(rawFiles.map(() => 0)) };
  }

  const compressed = await compressImageFiles(rawFiles);

  const finalIssue = attachmentLimitReason(compressed.map((file) => file.size));
  if (finalIssue) return { formData, error: finalIssue };

  formData.delete("attachments");
  for (const file of compressed) formData.append("attachments", file);
  return { formData, error: null };
}
