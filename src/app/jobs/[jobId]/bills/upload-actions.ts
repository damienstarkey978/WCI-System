"use server";

import { revalidatePath } from "next/cache";

import { requireAppUser } from "@/lib/auth";
import { JobNotFoundError, NoCostCodesError, createBillFromOcr } from "@/lib/ai/bill-ocr-service";
import type { BillOcrDocumentInput } from "@/lib/ai/bill-ocr-assistant";
import { isAnthropicConfigured } from "@/lib/env";

export interface UploadState {
  readonly error?: string;
  /** One line per processed file, so a partial batch still reports what landed. */
  readonly results?: readonly { readonly fileName: string; readonly ok: boolean; readonly detail: string }[];
}

/** What Claude's vision API will accept here. HEIC is deliberately absent — see below. */
const ACCEPTED: Record<string, BillOcrDocumentInput["mediaType"]> = {
  "image/png": "image/png",
  "image/jpeg": "image/jpeg",
  "image/gif": "image/gif",
  "image/webp": "image/webp",
  "application/pdf": "application/pdf",
};

/** Keeps one batch well under the serverless function's request body limit. */
const MAX_TOTAL_BYTES = 20 * 1024 * 1024;

/**
 * Drag-and-drop / browse intake for receipts and vendor invoices.
 *
 * Each file goes through the Phase 8 OCR path (src/lib/ai/bill-ocr-service.ts),
 * which lands the result in IN_REVIEW — extracted but unconfirmed. Nothing here can
 * produce a payable bill without a human afterward, which is the whole point of the
 * Inbox → In review → Approved → Ready for payment pipeline.
 *
 * Files are processed one at a time and failures are reported per file rather than
 * aborting the batch: dropping eight receipts and losing all of them because the
 * third was a screenshot of an email is worse than getting seven.
 */
export async function uploadBillsAction(_previous: UploadState, formData: FormData): Promise<UploadState> {
  const user = await requireAppUser();
  const jobId = String(formData.get("jobId") ?? "");

  if (!isAnthropicConfigured()) {
    return { error: "AI bill capture needs ANTHROPIC_API_KEY configured. Add a bill by hand in the meantime." };
  }

  const files = formData.getAll("files").filter((entry): entry is File => entry instanceof File && entry.size > 0);
  if (files.length === 0) return { error: "Choose at least one receipt or invoice to upload." };

  const totalBytes = files.reduce((total, file) => total + file.size, 0);
  if (totalBytes > MAX_TOTAL_BYTES) {
    return { error: `That batch is ${(totalBytes / 1024 / 1024).toFixed(1)}MB. Upload up to 20MB at a time.` };
  }

  const results: { fileName: string; ok: boolean; detail: string }[] = [];

  for (const file of files) {
    const mediaType = ACCEPTED[file.type];
    if (!mediaType) {
      // iPhones hand over .heic by default and Claude's vision API won't take it —
      // say so plainly rather than failing with an opaque API error.
      const hint = file.type === "image/heic" || file.name.toLowerCase().endsWith(".heic")
        ? "HEIC isn't supported yet — set the iPhone camera to \"Most Compatible\", or convert to JPEG first."
        : `${file.type || "That file type"} isn't supported. Use PNG, JPEG, GIF, WebP, or PDF.`;
      results.push({ fileName: file.name, ok: false, detail: hint });
      continue;
    }

    try {
      const bytes = Buffer.from(await file.arrayBuffer());

      // Same pre-flight the email path does — a clear reason beats the vision API's
      // "Could not process image".
      const { describeImage, rejectionReason } = await import("@/lib/ai/image-probe");
      const reason = rejectionReason(bytes, file.type);
      if (reason) {
        results.push({ fileName: file.name, ok: false, detail: `${describeImage(bytes)} — ${reason}.` });
        continue;
      }

      const data = bytes.toString("base64");
      const { bill, assumptions } = await createBillFromOcr({
        organizationId: user.organizationId,
        jobId,
        document: { data, mediaType },
      });

      // The extracted bill keeps the receipt's own filename as its title, matching
      // how these actually arrive, and records who dropped it in.
      await (await import("@/lib/db")).db.bill.update({
        where: { id: bill.id },
        data: { title: file.name, source: "UPLOAD", createdByUserId: user.id },
      });

      results.push({
        fileName: file.name,
        ok: true,
        detail: assumptions.length > 0 ? `Read as ${bill.vendorName}. ${assumptions[0]}` : `Read as ${bill.vendorName}.`,
      });
    } catch (error) {
      if (error instanceof JobNotFoundError || error instanceof NoCostCodesError) {
        return { error: error.message };
      }
      results.push({
        fileName: file.name,
        ok: false,
        detail: error instanceof Error ? error.message : "Could not read that file.",
      });
    }
  }

  revalidatePath(`/jobs/${jobId}/bills`);
  return { results };
}
