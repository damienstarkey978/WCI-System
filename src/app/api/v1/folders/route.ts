/**
 * GET /api/v1/folders?jobId= — list FileFolders for a job (Documents folders +
 * inspection picture folders). jobId is required.
 */

import { apiError, withApiAuth } from "@/lib/api-auth";
import { formatZodIssues, listFoldersQuerySchema } from "@/lib/api-schemas";
import { db } from "@/lib/db";
import { listFolders } from "@/lib/files/folders";

export const GET = withApiAuth(["files:read"], async (request, auth) => {
  const parsed = listFoldersQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) {
    return apiError(400, "invalid_query", "jobId is required.", formatZodIssues(parsed.error));
  }

  const job = await db.job.findFirst({
    where: { id: parsed.data.jobId, organizationId: auth.organizationId },
    select: { id: true },
  });
  if (!job) return apiError(404, "not_found", `Job ${parsed.data.jobId} not found.`);

  const folders = await listFolders(auth.organizationId, job.id);
  return Response.json({ data: folders });
});
