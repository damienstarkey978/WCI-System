/**
 * GET /api/v1/jobs/{jobId}/files — job-scoped alias of GET /files?jobId=.
 * Supports folderId, category, limit, cursor.
 */

import { apiError, withApiAuth } from "@/lib/api-auth";
import { formatZodIssues, listFilesQuerySchema } from "@/lib/api-schemas";
import { toCursorPage } from "@/lib/api-pagination";
import { db } from "@/lib/db";

type Context = { params: Promise<{ jobId: string }> };

export const GET = withApiAuth<Context>(["files:read"], async (request, auth, context) => {
  const { jobId } = await context.params;
  const parsed = listFilesQuerySchema.safeParse({
    ...Object.fromEntries(new URL(request.url).searchParams),
    jobId,
  });
  if (!parsed.success) {
    return apiError(400, "invalid_query", "Invalid query parameters.", formatZodIssues(parsed.error));
  }
  const { category, folderId, limit, cursor } = parsed.data;

  const job = await db.job.findFirst({
    where: { id: jobId, organizationId: auth.organizationId },
    select: { id: true },
  });
  if (!job) return apiError(404, "not_found", `Job ${jobId} not found.`);

  const files = await db.file.findMany({
    where: {
      organizationId: auth.organizationId,
      jobId,
      deletedAt: null,
      ...(category ? { category } : {}),
      ...(folderId ? { folderId } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });

  return Response.json(toCursorPage(files, limit));
});
