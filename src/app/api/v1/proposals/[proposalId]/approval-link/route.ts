/**
 * /api/v1/proposals/[proposalId]/approval-link — issue a single-use e-sign
 * link for the client (CLAUDE.md 2.3: headless, no-login-required approval),
 * same pattern as Change Order and Selection links.
 */

import { ClientActionTokenPurpose } from "@/generated/prisma/enums";
import { apiError, withApiAuth } from "@/lib/api-auth";
import { formatZodIssues, requestApprovalLinkSchema } from "@/lib/api-schemas";
import { ClientNotFoundError, issueApprovalLink } from "@/lib/client-portal/auth";
import { db } from "@/lib/db";

type Context = { params: Promise<{ proposalId: string }> };

export const POST = withApiAuth<Context>(["proposals:write"], async (request, auth, context) => {
  const { proposalId } = await context.params;

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return apiError(400, "invalid_json", "Request body must be valid JSON.");
  }

  const parsed = requestApprovalLinkSchema.safeParse(payload);
  if (!parsed.success) {
    return apiError(422, "validation_failed", "The approval link could not be issued.", formatZodIssues(parsed.error));
  }

  const proposal = await db.proposal.findFirst({
    where: { id: proposalId, organizationId: auth.organizationId },
    select: { id: true },
  });
  if (!proposal) return apiError(404, "not_found", `Proposal ${proposalId} not found`);

  try {
    const { token } = await issueApprovalLink({
      organizationId: auth.organizationId,
      clientId: parsed.data.clientId,
      purpose: ClientActionTokenPurpose.PROPOSAL_ACCEPTANCE,
      resourceId: proposalId,
    });
    return Response.json({ data: { token } }, { status: 201 });
  } catch (error) {
    if (error instanceof ClientNotFoundError) return apiError(404, "not_found", error.message);
    throw error;
  }
});
