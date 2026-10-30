/** /api/v1/leads — create/list CRM leads. */

import { apiError, withApiAuth } from "@/lib/api-auth";
import { createLeadSchema, formatZodIssues, listLeadsQuerySchema } from "@/lib/api-schemas";
import { toCursorPage } from "@/lib/api-pagination";
import { createLead } from "@/lib/crm/service";
import { db } from "@/lib/db";

export const GET = withApiAuth(["leads:read"], async (request, auth) => {
  const parsed = listLeadsQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) {
    return apiError(400, "invalid_query", "Invalid query parameters.", formatZodIssues(parsed.error));
  }
  const { stage, assignedUserId, limit, cursor } = parsed.data;

  const leads = await db.lead.findMany({
    where: {
      organizationId: auth.organizationId,
      ...(stage ? { stage: stage as never } : {}),
      ...(assignedUserId ? { assignedUserId } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });

  return Response.json(toCursorPage(leads, limit));
});

export const POST = withApiAuth(["leads:write"], async (request, auth) => {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return apiError(400, "invalid_json", "Request body must be valid JSON.");
  }

  const parsed = createLeadSchema.safeParse(payload);
  if (!parsed.success) {
    return apiError(422, "validation_failed", "The lead could not be created.", formatZodIssues(parsed.error));
  }

  const lead = await createLead({ organizationId: auth.organizationId, ...parsed.data });
  return Response.json({ data: lead }, { status: 201 });
});
