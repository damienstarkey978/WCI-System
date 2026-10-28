/**
 * GET /api/v1/takeoffs — list takeoffs (optionally filtered by jobId).
 * Prefer ?jobId= or GET /jobs/{jobId}/takeoffs for MCP-sized pages.
 */

import { apiError, withApiAuth } from "@/lib/api-auth";
import { formatZodIssues, listTakeoffsQuerySchema } from "@/lib/api-schemas";
import { toCursorPage } from "@/lib/api-pagination";
import { db } from "@/lib/db";

export const GET = withApiAuth(["takeoffs:read"], async (request, auth) => {
  const parsed = listTakeoffsQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) {
    return apiError(400, "invalid_query", "Invalid query parameters.", formatZodIssues(parsed.error));
  }
  const { jobId, limit, cursor } = parsed.data;

  if (jobId) {
    const job = await db.job.findFirst({
      where: { id: jobId, organizationId: auth.organizationId },
      select: { id: true },
    });
    if (!job) return apiError(404, "not_found", `Job ${jobId} not found.`);
  }

  const rows = await db.takeoff.findMany({
    where: {
      organizationId: auth.organizationId,
      ...(jobId ? { jobId } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    select: {
      id: true,
      jobId: true,
      title: true,
      status: true,
      aiGenerated: true,
      createdAt: true,
      _count: { select: { lines: true } },
    },
  });

  const page = toCursorPage(rows, limit);
  return Response.json({
    data: page.data.map((takeoff) => ({
      id: takeoff.id,
      jobId: takeoff.jobId,
      title: takeoff.title,
      status: takeoff.status,
      aiGenerated: takeoff.aiGenerated,
      lineItemCount: takeoff._count.lines,
      createdAt: takeoff.createdAt.toISOString(),
    })),
    pagination: page.pagination,
  });
});
