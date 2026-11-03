/** PATCH /api/v1/proposals/{proposalId}/client-display — financing + pricing display (CR P3 #27/#30). */

import { apiError, withApiAuth } from "@/lib/api-auth";
import { formatZodIssues, updateProposalClientDisplaySchema } from "@/lib/api-schemas";
import {
  ProposalNotEditableError,
  ProposalNotFoundError,
  updateProposalClientDisplay,
} from "@/lib/proposals/service";

type Context = { params: Promise<{ proposalId: string }> };

export const PATCH = withApiAuth<Context>(["proposals:write"], async (request, auth, context) => {
  const { proposalId } = await context.params;
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return apiError(400, "invalid_json", "Request body must be valid JSON.");
  }
  const parsed = updateProposalClientDisplaySchema.safeParse(payload);
  if (!parsed.success) {
    return apiError(422, "validation_failed", "Client display could not be updated.", formatZodIssues(parsed.error));
  }
  if (parsed.data.showFinancing === undefined && parsed.data.pricingDisplay === undefined) {
    return apiError(422, "validation_failed", "Provide showFinancing and/or pricingDisplay.");
  }

  try {
    const proposal = await updateProposalClientDisplay(auth.organizationId, proposalId, parsed.data);
    return Response.json({ data: proposal });
  } catch (error) {
    if (error instanceof ProposalNotFoundError) return apiError(404, "not_found", error.message);
    if (error instanceof ProposalNotEditableError) return apiError(409, "not_editable", error.message);
    throw error;
  }
});
