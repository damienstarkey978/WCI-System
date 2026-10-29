/**
 * /api/v1/files — file metadata registration. See src/lib/files/service.ts for
 * why there's no upload endpoint yet (no S3/R2 credentials configured).
 *
 * List honors limit/cursor/folderId/jobId/category. File.url may be a storage
 * key — use GET /files/{fileId} for a signed downloadUrl.
 */

import { actorFromApiKey } from "@/lib/actor";
import { apiError, withApiAuth } from "@/lib/api-auth";
import { formatZodIssues, listFilesQuerySchema, registerFileSchema } from "@/lib/api-schemas";
import { toCursorPage } from "@/lib/api-pagination";
import { db } from "@/lib/db";
import { DailyLogNotFoundError, JobNotFoundError, registerFile } from "@/lib/files/service";

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

export const POST = withApiAuth(["files:write"], async (request, auth) => {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return apiError(400, "invalid_json", "Request body must be valid JSON.");
  }

  const parsed = registerFileSchema.safeParse(payload);
  if (!parsed.success) {
    return apiError(422, "validation_failed", "The file could not be registered.", formatZodIssues(parsed.error));
  }

  try {
    const file = await registerFile({
      organizationId: auth.organizationId,
      ...parsed.data,
      actor: actorFromApiKey(auth.apiKeyId),
    });
    return Response.json({ data: file }, { status: 201 });
  } catch (error) {
    if (error instanceof JobNotFoundError || error instanceof DailyLogNotFoundError) {
      return apiError(422, "not_found", error.message);
    }
    throw error;
  }
});
