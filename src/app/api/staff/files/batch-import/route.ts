/**
 * POST /api/staff/files/batch-import — admin-only bulk file import, authenticated
 * by the caller's existing Clerk session cookie (this route deliberately lives
 * outside /api/v1, which is API-key-only per src/proxy.ts — this is for a human
 * staff session, not a machine credential).
 *
 * Built for the Buildertrend photo/document migration: the caller already has
 * the file bytes (fetched from wherever, base64-encoded) and just needs them
 * uploaded to Storage and registered as File rows in one authenticated request,
 * without ever handling a Supabase key directly.
 */

import { UserRole } from "@/generated/prisma/enums";
import { AuthConfigurationError, requireRole } from "@/lib/auth";
import { JobNotFoundError, DailyLogNotFoundError, uploadAndRegisterFile } from "@/lib/files/service";
import { StorageNotConfiguredError } from "@/lib/storage/supabase-storage";

const CATEGORIES = new Set(["DOCUMENT", "PHOTO", "VIDEO"]);

// Keeps the whole batch well under Netlify's function payload limit.
const MAX_TOTAL_DECODED_BYTES = 40 * 1024 * 1024;

interface BatchImportFileInput {
  readonly jobId: string;
  readonly dailyLogId?: string;
  readonly fileName: string;
  readonly mimeType?: string;
  readonly category?: string;
  readonly clientVisible?: boolean;
  readonly subVisible?: boolean;
  readonly dataBase64: string;
}

interface FileResult {
  readonly fileName: string;
  readonly jobId: string;
  readonly status: "success" | "error";
  readonly fileId?: string;
  readonly error?: string;
}

function estimateDecodedBytes(base64: string): number {
  return Math.floor((base64.length * 3) / 4);
}

export async function POST(request: Request) {
  let user;
  try {
    user = await requireRole(UserRole.ADMIN);
  } catch (error) {
    if (error instanceof AuthConfigurationError) {
      return Response.json({ error: { code: "unauthorized", message: error.message } }, { status: 401 });
    }
    throw error;
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: { code: "invalid_json", message: "Request body must be valid JSON." } }, { status: 400 });
  }

  const files = (payload as { files?: unknown })?.files;
  if (!Array.isArray(files) || files.length === 0) {
    return Response.json({ error: { code: "invalid_body", message: "Expected a non-empty `files` array." } }, { status: 422 });
  }

  const totalEstimatedBytes = files.reduce((total, entry) => {
    const dataBase64 = (entry as BatchImportFileInput)?.dataBase64;
    return total + (typeof dataBase64 === "string" ? estimateDecodedBytes(dataBase64) : 0);
  }, 0);
  if (totalEstimatedBytes > MAX_TOTAL_DECODED_BYTES) {
    return Response.json(
      {
        error: {
          code: "payload_too_large",
          message: `Batch decodes to ~${Math.round(totalEstimatedBytes / (1024 * 1024))}MB, over the ${MAX_TOTAL_DECODED_BYTES / (1024 * 1024)}MB cap. Split into smaller batches.`,
        },
      },
      { status: 413 },
    );
  }

  const results: FileResult[] = [];

  for (const entry of files as BatchImportFileInput[]) {
    const jobId = String(entry?.jobId ?? "");
    const fileName = String(entry?.fileName ?? "");
    try {
      if (!jobId || !fileName || typeof entry?.dataBase64 !== "string") {
        throw new Error("Each file requires jobId, fileName, and dataBase64.");
      }
      const categoryRaw = entry.category?.toUpperCase();
      const category = categoryRaw && CATEGORIES.has(categoryRaw) ? (categoryRaw as "DOCUMENT" | "PHOTO" | "VIDEO") : "DOCUMENT";
      const bytes = Buffer.from(entry.dataBase64, "base64");

      const file = await uploadAndRegisterFile({
        organizationId: user.organizationId,
        jobId,
        uploadedByUserId: user.id,
        fileName,
        bytes,
        mimeType: entry.mimeType ?? null,
        sizeBytes: bytes.byteLength,
        category,
        clientVisible: entry.clientVisible ?? true,
        subVisible: entry.subVisible ?? true,
        dailyLogId: entry.dailyLogId ?? null,
      });

      results.push({ fileName, jobId, status: "success", fileId: file.id });
    } catch (error) {
      if (error instanceof StorageNotConfiguredError) {
        return Response.json({ error: { code: "storage_not_configured", message: error.message } }, { status: 503 });
      }
      const message =
        error instanceof JobNotFoundError || error instanceof DailyLogNotFoundError
          ? error.message
          : error instanceof Error
            ? error.message
            : "Unknown error";
      results.push({ fileName, jobId, status: "error", error: message });
    }
  }

  return Response.json({ data: results });
}
