/**
 * GET /api/v1/jobs/{jobId}/change-orders — job-scoped alias of GET /change-orders?jobId=.
 */

import { apiError, withApiAuth } from "@/lib/api-auth";
import { formatZodIssues, listChangeOrdersQuerySchema } from "@/lib/api-schemas";
import { toCursorPage } from "@/lib/api-pagination";
import { db } from "@/lib/db";

type Context = { params: Promise<{ jobId: string }> };

export const GET = withApiAuth<Context>(["change-orders:read"], async (request, auth, context) => {
  const { jobId } = await context.params;
  const parsed = listChangeOrdersQuerySchema.safeParse({
    ...Object.fromEntries(new URL(request.url).searchParams),
    jobId,
  });
  if (!parsed.success) {
    return apiError(400, "invalid_query", "Invalid query parameters.", formatZodIssues(parsed.error));
  }
  const { status, limit, cursor } = parsed.data;

  const job = await db.job.findFirst({
    where: { id: jobId, organizationId: auth.organizationId },
    select: { id: true },
  });
  if (!job) return apiError(404, "not_found", `Job ${jobId} not found.`);

  const changeOrders = await db.changeOrder.findMany({
    where: {
      organizationId: auth.organizationId,
      jobId,
      ...(status ? { status: status as never } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    include: { lineItems: { orderBy: { sortOrder: "asc" } } },
  });

  return Response.json(toCursorPage(changeOrders, limit));
});
