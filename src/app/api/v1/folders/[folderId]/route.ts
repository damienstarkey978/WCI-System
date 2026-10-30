/**
 * DELETE /api/v1/folders/{folderId} — remove a Documents or Inspection Pictures folder.
 *
 * Inspection folders: soft-delete (trash) photos in the folder, remove the linked
 * JobPermitInspection (so ensure will not recreate the folder), then delete the
 * FileFolder. Document folders: delete the folder only; files stay on the job unfiled.
 */

import { apiError, withApiAuth } from "@/lib/api-auth";
import { deleteFolder, FolderNotFoundError } from "@/lib/files/folders";

type Context = { params: Promise<{ folderId: string }> };

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
