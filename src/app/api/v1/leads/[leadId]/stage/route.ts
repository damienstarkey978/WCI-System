/** /api/v1/leads/[leadId]/stage — move a lead through the CRM pipeline. */

import { apiError, withApiAuth } from "@/lib/api-auth";
import { formatZodIssues, updateLeadStageSchema } from "@/lib/api-schemas";
import { LeadNotFoundError, updateLeadStage } from "@/lib/crm/service";

type Context = { params: Promise<{ leadId: string }> };

export const POST = withApiAuth<Context>(["leads:write"], async (request, auth, context) => {
  const { leadId } = await context.params;

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return apiError(400, "invalid_json", "Request body must be valid JSON.");
  }

  const parsed = updateLeadStageSchema.safeParse(payload);
  if (!parsed.success) {
    return apiError(422, "validation_failed", "The lead's stage could not be updated.", formatZodIssues(parsed.error));
  }

  try {
    const lead = await updateLeadStage(auth.organizationId, leadId, parsed.data.stage);
    return Response.json({ data: lead });
  } catch (error) {
    if (error instanceof LeadNotFoundError) return apiError(404, "not_found", error.message);
    throw error;
  }
});
