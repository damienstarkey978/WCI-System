/** /api/v1/change-orders — create/list change orders. */

import { apiError, withApiAuth } from "@/lib/api-auth";
import { createChangeOrderSchema, formatZodIssues } from "@/lib/api-schemas";
import { createChangeOrder, JobNotFoundError, JobNotOpenError } from "@/lib/change-orders/service";
import { db } from "@/lib/db";

export const GET = withApiAuth(["change-orders:read"], async (request, auth) => {
  const params = new URL(request.url).searchParams;
  const jobId = params.get("jobId");
  const status = params.get("status");

  const changeOrders = await db.changeOrder.findMany({
    where: {
      organizationId: auth.organizationId,
      ...(jobId ? { jobId } : {}),
      ...(status ? { status: status as never } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { lineItems: { orderBy: { sortOrder: "asc" } } },
  });

  return Response.json({ data: changeOrders });
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
