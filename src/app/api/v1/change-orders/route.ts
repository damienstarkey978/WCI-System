/** /api/v1/change-orders — create/list change orders. */

import { apiError, withApiAuth } from "@/lib/api-auth";
import { createChangeOrderSchema, formatZodIssues, listChangeOrdersQuerySchema } from "@/lib/api-schemas";
import { toCursorPage } from "@/lib/api-pagination";
import { createChangeOrder, JobNotFoundError, JobNotOpenError } from "@/lib/change-orders/service";
import { db } from "@/lib/db";

export const GET = withApiAuth(["change-orders:read"], async (request, auth) => {
  const parsed = listChangeOrdersQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) {
    return apiError(400, "invalid_query", "Invalid query parameters.", formatZodIssues(parsed.error));
  }
  const { jobId, status, limit, cursor } = parsed.data;

  const changeOrders = await db.changeOrder.findMany({
    where: {
      organizationId: auth.organizationId,
      ...(jobId ? { jobId } : {}),
      ...(status ? { status: status as never } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    include: { lineItems: { orderBy: { sortOrder: "asc" } } },
  });

  return Response.json(toCursorPage(changeOrders, limit));
});

export const POST = withApiAuth(["change-orders:write"], async (request, auth) => {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return apiError(400, "invalid_json", "Request body must be valid JSON.");
  }

  const parsed = createChangeOrderSchema.safeParse(payload);
  if (!parsed.success) {
    return apiError(422, "validation_failed", "The change order could not be created.", formatZodIssues(parsed.error));
  }

  try {
    const changeOrder = await createChangeOrder({ organizationId: auth.organizationId, ...parsed.data });
    return Response.json({ data: changeOrder }, { status: 201 });
  } catch (error) {
    if (error instanceof JobNotFoundError) {
      return apiError(422, "unknown_job", error.message);
    }
    if (error instanceof JobNotOpenError) {
      return apiError(409, "job_not_open", error.message);
    }
    throw error;
  }
});
