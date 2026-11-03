/** PATCH /api/v1/proposals/[proposalId]/require-signature — CR P1 #8. */

import { apiError, withApiAuth } from "@/lib/api-auth";
import { formatZodIssues, updateProposalRequireSignatureSchema } from "@/lib/api-schemas";
import {
  ProposalNotEditableError,
  ProposalNotFoundError,
  setProposalRequireSignature,
  SignaturePolicyAdminRequiredError,
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
  const parsed = updateProposalRequireSignatureSchema.safeParse(payload);
  if (!parsed.success) {
    return apiError(422, "validation_failed", "requireSignature could not be updated.", formatZodIssues(parsed.error));
  }

  // Machine API keys have no UserRole — turning require-signature OFF is staff-admin only
  // (Server Action with Clerk ADMIN). Agents may only turn it back ON.
  const actorRole = parsed.data.requireSignature ? "ADMIN" : null;

  try {
    const proposal = await setProposalRequireSignature({
      organizationId: auth.organizationId,
      proposalId,
      requireSignature: parsed.data.requireSignature,
      actorRole,
    });
    return Response.json({ data: proposal });
  } catch (error) {
    if (error instanceof ProposalNotFoundError) return apiError(404, "not_found", error.message);
    if (error instanceof ProposalNotEditableError) return apiError(409, "not_editable", error.message);
    if (error instanceof SignaturePolicyAdminRequiredError) {
      return apiError(403, "admin_required", error.message);
    }
    throw error;
  }
});
