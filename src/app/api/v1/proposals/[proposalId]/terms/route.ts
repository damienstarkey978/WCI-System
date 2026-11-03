/** PATCH /api/v1/proposals/[proposalId]/terms — set proposal terms (CR P1 #6). */

import { apiError, withApiAuth } from "@/lib/api-auth";
import { formatZodIssues, updateProposalTermsSchema } from "@/lib/api-schemas";
import {
  IncompleteProposalTermsError,
  ProposalNotEditableError,
  ProposalNotFoundError,
  updateProposalTerms,
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
  const parsed = updateProposalTermsSchema.safeParse(payload);
  if (!parsed.success) {
    return apiError(422, "validation_failed", "Terms could not be updated.", formatZodIssues(parsed.error));
  }

  try {
    const proposal = await updateProposalTerms(auth.organizationId, proposalId, parsed.data.termsText);
    return Response.json({ data: proposal });
  } catch (error) {
    if (error instanceof ProposalNotFoundError) return apiError(404, "not_found", error.message);
    if (error instanceof ProposalNotEditableError) return apiError(409, "not_editable", error.message);
    if (error instanceof IncompleteProposalTermsError) {
      return apiError(422, "incomplete_terms", error.message, { reasons: error.reasons });
    }
    throw error;
  }
});
