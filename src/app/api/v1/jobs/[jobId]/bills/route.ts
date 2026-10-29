/**
 * GET /api/v1/jobs/{jobId}/bills — job-scoped alias of GET /bills?jobId=.
 * Same scopes and pagination as the org-level list.
 */

import { apiError, withApiAuth } from "@/lib/api-auth";
import { formatZodIssues, listBillsQuerySchema } from "@/lib/api-schemas";
import { toCursorPage } from "@/lib/api-pagination";
import { db } from "@/lib/db";

type Context = { params: Promise<{ jobId: string }> };

export const GET = withApiAuth<Context>(["bills:read"], async (request, auth, context) => {
  const { jobId } = await context.params;
  const url = new URL(request.url);
  const parsed = listBillsQuerySchema.safeParse({
    ...Object.fromEntries(url.searchParams),
    jobId,
  });
  if (!parsed.success) {
    return apiError(400, "invalid_query", "Invalid query parameters.", formatZodIssues(parsed.error));
  }
  const { approvalStatus, limit, cursor } = parsed.data;

  const job = await db.job.findFirst({
    where: { id: jobId, organizationId: auth.organizationId },
    select: { id: true },
  });
  if (!job) return apiError(404, "not_found", `Job ${jobId} not found.`);

  const bills = await db.bill.findMany({
    where: {
      organizationId: auth.organizationId,
      jobId,
      ...(approvalStatus ? { approvalStatus } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    include: { lineItems: { orderBy: { sortOrder: "asc" } } },
  });

  return Response.json(toCursorPage(bills, limit));
});
