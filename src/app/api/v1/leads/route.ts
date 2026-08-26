/** /api/v1/leads — create/list CRM leads. */

import { apiError, withApiAuth } from "@/lib/api-auth";
import { createLeadSchema, formatZodIssues } from "@/lib/api-schemas";
import { createLead } from "@/lib/crm/service";
import { db } from "@/lib/db";

export const GET = withApiAuth(["leads:read"], async (request, auth) => {
  const params = new URL(request.url).searchParams;
  const stage = params.get("stage");
  const assignedUserId = params.get("assignedUserId");

  const leads = await db.lead.findMany({
    where: {
      organizationId: auth.organizationId,
      ...(stage ? { stage: stage as never } : {}),
      ...(assignedUserId ? { assignedUserId } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  return Response.json({ data: leads });
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
