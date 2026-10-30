/**
 * PATCH  /api/v1/folders/{folderId} — rename and/or change clientVisible/subVisible.
 * DELETE /api/v1/folders/{folderId} — remove a Documents or Inspection Pictures folder.
 *
 * Inspection folders: soft-delete (trash) photos in the folder, remove the linked
 * JobPermitInspection (so ensure will not recreate the folder), then delete the
 * FileFolder. Document folders: delete the folder only; files stay on the job unfiled.
 */

import { apiError, withApiAuth } from "@/lib/api-auth";
import { formatZodIssues, updateFolderSchema } from "@/lib/api-schemas";
import {
  deleteFolder,
  FolderNameTakenError,
  FolderNotFoundError,
  updateFolder,
} from "@/lib/files/folders";

type Context = { params: Promise<{ folderId: string }> };

export const PATCH = withApiAuth<Context>(["files:write"], async (request, auth, context) => {
  const { folderId } = await context.params;

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return apiError(400, "invalid_json", "Request body must be valid JSON.");
  }

  const parsed = updateFolderSchema.safeParse(payload);
  if (!parsed.success) {
    return apiError(422, "validation_failed", "The folder could not be updated.", formatZodIssues(parsed.error));
  }

  try {
    const folder = await updateFolder(auth.organizationId, folderId, parsed.data);
    return Response.json({
      data: {
        id: folder.id,
        name: folder.name,
        clientVisible: folder.clientVisible,
        subVisible: folder.subVisible,
        createdAt: folder.createdAt,
        updatedAt: folder.updatedAt,
      },
    });
  } catch (error) {
    if (error instanceof FolderNotFoundError) {
      return apiError(404, "not_found", error.message);
    }
    if (error instanceof FolderNameTakenError) {
      return apiError(409, "conflict", error.message);
    }
    console.error("PATCH /api/v1/folders/{folderId} failed:", error);
    return apiError(
      500,
      "folder_update_failed",
      error instanceof Error ? error.message : "The folder could not be updated.",
    );
  }
});

export const DELETE = withApiAuth<Context>(["files:write"], async (_request, auth, context) => {
  const { folderId } = await context.params;

  try {
    const deleted = await deleteFolder(auth.organizationId, folderId);
    return Response.json({ data: { deleted: true, ...deleted } });
  } catch (error) {
    if (error instanceof FolderNotFoundError) {
      return apiError(404, "not_found", error.message);
    }
    throw error;
  }
});
