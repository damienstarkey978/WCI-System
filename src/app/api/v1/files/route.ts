/**
 * /api/v1/files — register file metadata and/or upload bytes into Supabase Storage.
 *
 * POST accepts:
 *   1. multipart/form-data with a `file` (or `bytes`) field — preferred for bots/staff
 *      putting image bytes into an inspection folder.
 *   2. JSON `{ dataBase64, fileName, jobId, ... }` — same upload path without multipart.
 *   3. JSON `{ url, fileName, jobId, ... }` — URL-only registration (legacy).
 *
 * List honors limit/cursor/folderId/jobId/category. File.url may be a storage
 * key — use GET /files/{fileId} for a signed downloadUrl.
 *
 * Unknown / other-job folderId → 422 JSON (never empty 500). Unexpected errors are
 * logged server-side and returned as JSON 500 with the message.
 */

import { actorFromApiKey } from "@/lib/actor";
import { apiError, withApiAuth } from "@/lib/api-auth";
import {
  formatZodIssues,
  listFilesQuerySchema,
  registerFileSchema,
  uploadFileJsonSchema,
} from "@/lib/api-schemas";
import { toCursorPage } from "@/lib/api-pagination";
import { db } from "@/lib/db";
import { FolderNotFoundError, FolderWrongJobError } from "@/lib/files/folders";
import {
  DailyLogNotFoundError,
  JobNotFoundError,
  registerFile,
  uploadAndRegisterFile,
} from "@/lib/files/service";
import { DEFAULT_FILE_VISIBILITY } from "@/lib/files/visibility";
import { StorageNotConfiguredError } from "@/lib/storage/supabase-storage";

export const GET = withApiAuth(["files:read"], async (request, auth) => {
  const parsed = listFilesQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) {
    return apiError(400, "invalid_query", "Invalid query parameters.", formatZodIssues(parsed.error));
  }
  const { jobId, category, folderId, limit, cursor } = parsed.data;

  const files = await db.file.findMany({
    where: {
      organizationId: auth.organizationId,
      deletedAt: null,
      ...(jobId ? { jobId } : {}),
      ...(category ? { category } : {}),
      ...(folderId ? { folderId } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });

  return Response.json(toCursorPage(files, limit));
});

const CATEGORIES = new Set(["DOCUMENT", "PHOTO", "VIDEO", "PRESALE_PHOTO", "PLAN"]);

function parseCategory(raw: FormDataEntryValue | null | undefined) {
  const value = typeof raw === "string" ? raw.toUpperCase() : "";
  return CATEGORIES.has(value) ? (value as "DOCUMENT" | "PHOTO" | "VIDEO" | "PRESALE_PHOTO" | "PLAN") : undefined;
}

function parseBool(raw: FormDataEntryValue | null | undefined, fallback: boolean | undefined) {
  if (typeof raw !== "string" || raw === "") return fallback;
  if (raw === "true" || raw === "1") return true;
  if (raw === "false" || raw === "0") return false;
  return fallback;
}

/** Strip a data: URL prefix so callers can paste browser-style base64. */
function normalizeDataBase64(raw: string): string {
  const trimmed = raw.trim();
  const match = /^data:[^;]+;base64,(.+)$/i.exec(trimmed);
  return match?.[1] ?? trimmed;
}

function mapUploadError(error: unknown): Response | null {
  if (error instanceof StorageNotConfiguredError) {
    return apiError(503, "storage_not_configured", error.message);
  }
  if (error instanceof JobNotFoundError || error instanceof DailyLogNotFoundError) {
    return apiError(422, "not_found", error.message);
  }
  if (error instanceof FolderNotFoundError || error instanceof FolderWrongJobError) {
    return apiError(422, "invalid_folder", error.message);
  }
  return null;
}

function unexpectedUploadError(error: unknown, path: string): Response {
  console.error(`${path} failed:`, error);
  return apiError(
    500,
    "file_upload_failed",
    error instanceof Error ? error.message : "The file could not be uploaded.",
  );
}

async function handleMultipartUpload(request: Request, organizationId: string, apiKeyId: string) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return apiError(400, "invalid_multipart", "Request body must be valid multipart/form-data.");
  }

  const jobId = String(form.get("jobId") ?? "");
  const fileNameField = String(form.get("fileName") ?? "");
  const blob = form.get("file") ?? form.get("bytes");
  const isUpload =
    blob != null &&
    typeof blob === "object" &&
    "arrayBuffer" in blob &&
    typeof (blob as { arrayBuffer: unknown }).arrayBuffer === "function";
  if (!jobId || !isUpload) {
    return apiError(
      422,
      "validation_failed",
      "multipart upload requires jobId and a file (field name `file` or `bytes`).",
    );
  }

  const upload = blob as Blob & { name?: string; type?: string };
  const fileName = fileNameField || (typeof upload.name === "string" && upload.name ? upload.name : "upload.bin");
  const bytes = new Uint8Array(await upload.arrayBuffer());
  const mimeType =
    (typeof form.get("mimeType") === "string" && String(form.get("mimeType"))) ||
    upload.type ||
    null;
  const category = parseCategory(form.get("category")) ?? "PHOTO";
  const folderIdRaw = form.get("folderId");
  const folderId = typeof folderIdRaw === "string" && folderIdRaw ? folderIdRaw : null;
  const dailyLogIdRaw = form.get("dailyLogId");
  const dailyLogId = typeof dailyLogIdRaw === "string" && dailyLogIdRaw ? dailyLogIdRaw : null;

  try {
    const file = await uploadAndRegisterFile({
      organizationId,
      jobId,
      actor: actorFromApiKey(apiKeyId),
      fileName,
      bytes,
      mimeType,
      sizeBytes: bytes.byteLength,
      category,
      clientVisible: parseBool(form.get("clientVisible"), DEFAULT_FILE_VISIBILITY.clientVisible),
      subVisible: parseBool(form.get("subVisible"), DEFAULT_FILE_VISIBILITY.subVisible),
      dailyLogId,
      folderId,
    });
    return Response.json({ data: file }, { status: 201 });
  } catch (error) {
    return mapUploadError(error) ?? unexpectedUploadError(error, "POST /api/v1/files (multipart)");
  }
}

export const POST = withApiAuth(["files:write"], async (request, auth) => {
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("multipart/form-data")) {
    return handleMultipartUpload(request, auth.organizationId, auth.apiKeyId);
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return apiError(400, "invalid_json", "Request body must be valid JSON or multipart/form-data.");
  }

  const asRecord = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};

  // Bytes upload (preferred for inspection photos when multipart isn't convenient).
  if (typeof asRecord.dataBase64 === "string") {
    const normalized = {
      ...asRecord,
      dataBase64: normalizeDataBase64(asRecord.dataBase64),
    };
    const parsed = uploadFileJsonSchema.safeParse(normalized);
    if (!parsed.success) {
      return apiError(422, "validation_failed", "The file could not be uploaded.", formatZodIssues(parsed.error));
    }
    try {
      const bytes = Buffer.from(parsed.data.dataBase64, "base64");
      if (bytes.byteLength === 0) {
        return apiError(422, "validation_failed", "dataBase64 decoded to an empty file.");
      }
      const file = await uploadAndRegisterFile({
        organizationId: auth.organizationId,
        jobId: parsed.data.jobId,
        actor: actorFromApiKey(auth.apiKeyId),
        fileName: parsed.data.fileName,
        bytes,
        mimeType: parsed.data.mimeType ?? null,
        sizeBytes: bytes.byteLength,
        category: parsed.data.category ?? "PHOTO",
        clientVisible: parsed.data.clientVisible ?? DEFAULT_FILE_VISIBILITY.clientVisible,
        subVisible: parsed.data.subVisible ?? DEFAULT_FILE_VISIBILITY.subVisible,
        dailyLogId: parsed.data.dailyLogId ?? null,
        folderId: parsed.data.folderId ?? null,
      });
      return Response.json({ data: file }, { status: 201 });
    } catch (error) {
      return mapUploadError(error) ?? unexpectedUploadError(error, "POST /api/v1/files (dataBase64)");
    }
  }

  const parsed = registerFileSchema.safeParse(payload);
  if (!parsed.success) {
    return apiError(
      422,
      "validation_failed",
      "Provide multipart file, JSON dataBase64, or a public url to register.",
      formatZodIssues(parsed.error),
    );
  }

  try {
    const file = await registerFile({
      organizationId: auth.organizationId,
      ...parsed.data,
      clientVisible: parsed.data.clientVisible ?? DEFAULT_FILE_VISIBILITY.clientVisible,
      subVisible: parsed.data.subVisible ?? DEFAULT_FILE_VISIBILITY.subVisible,
      actor: actorFromApiKey(auth.apiKeyId),
    });
    return Response.json({ data: file }, { status: 201 });
  } catch (error) {
    return mapUploadError(error) ?? unexpectedUploadError(error, "POST /api/v1/files (url)");
  }
});
