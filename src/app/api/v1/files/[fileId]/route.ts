/**
 * GET    /api/v1/files/{fileId} — metadata + signed downloadUrl when url is a storage key.
 * PATCH  /api/v1/files/{fileId} — move (folderId), rename (fileName), visibility.
 * DELETE /api/v1/files/{fileId} — soft-delete via deletedAt (trash; recoverable).
 */

import { apiError, withApiAuth } from "@/lib/api-auth";
import { formatZodIssues, updateFileSchema } from "@/lib/api-schemas";
import { db } from "@/lib/db";
import { FolderNotFoundError, FolderWrongJobError } from "@/lib/files/folders";
import {
  FileNotFoundError,
  resolveFileUrlSafe,
  trashFile,
  updateFile,
} from "@/lib/files/service";

type Context = { params: Promise<{ fileId: string }> };

export const GET = withApiAuth<Context>(["files:read"], async (_request, auth, context) => {
  const { fileId } = await context.params;
  const file = await db.file.findFirst({
    where: { id: fileId, organizationId: auth.organizationId, deletedAt: null },
  });
  if (!file) return apiError(404, "not_found", `File ${fileId} not found.`);

  const isHttpUrl = /^https?:\/\//i.test(file.url);
  const downloadUrl = isHttpUrl ? file.url : await resolveFileUrlSafe(file.url);

  return Response.json({
    data: {
      ...file,
      /** Raw stored value — may be an http(s) URL or a private storage path. */
      url: file.url,
      /**
       * Fetchable URL for the bytes. Null when the object cannot be signed
       * (missing from bucket / storage not configured).
       */
      downloadUrl,
      storageKey: isHttpUrl ? null : file.url,
    },
  });
});

export const PATCH = withApiAuth<Context>(["files:write"], async (request, auth, context) => {
  const { fileId } = await context.params;

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return apiError(400, "invalid_json", "Request body must be valid JSON.");
  }

  const parsed = updateFileSchema.safeParse(payload);
  if (!parsed.success) {
    return apiError(422, "validation_failed", "The file could not be updated.", formatZodIssues(parsed.error));
  }

  try {
    const file = await updateFile(auth.organizationId, fileId, parsed.data);
    return Response.json({ data: file });
  } catch (error) {
    if (error instanceof FileNotFoundError) {
      return apiError(404, "not_found", error.message);
    }
    if (error instanceof FolderNotFoundError || error instanceof FolderWrongJobError) {
      return apiError(422, "invalid_folder", error.message);
    }
    console.error("PATCH /api/v1/files/{fileId} failed:", error);
    return apiError(
      500,
      "file_update_failed",
      error instanceof Error ? error.message : "The file could not be updated.",
    );
  }
});

export const DELETE = withApiAuth<Context>(["files:write"], async (_request, auth, context) => {
  const { fileId } = await context.params;

  try {
    await trashFile(auth.organizationId, fileId);
    return Response.json({ data: { deleted: true, id: fileId } });
  } catch (error) {
    if (error instanceof FileNotFoundError) {
      return apiError(404, "not_found", error.message);
    }
    console.error("DELETE /api/v1/files/{fileId} failed:", error);
    return apiError(
      500,
      "file_delete_failed",
      error instanceof Error ? error.message : "The file could not be deleted.",
    );
  }
});
