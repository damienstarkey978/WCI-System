/**
 * POST /api/v1/portal/proposals/[proposalId]/feedback — the client-facing side
 * of submitProposalFeedback(). Same dual-auth shape as the accept endpoint,
 * except the token path uses peekActionToken (validate, don't consume): a
 * client leaving feedback ("like Option B but swap the fixtures") hasn't
 * decided yet, so it must not burn the single-use PROPOSAL_ACCEPTANCE link
 * they'll still need to actually accept.
 */

import { ClientActionTokenPurpose } from "@/generated/prisma/enums";
import { apiError, extractToken } from "@/lib/api-auth";
import { formatZodIssues, submitProposalFeedbackSchema } from "@/lib/api-schemas";
import { authenticateClientSession, InvalidActionTokenError, peekActionToken } from "@/lib/client-portal/auth";
import { ProposalClientMismatchError, ProposalNotFoundError, ProposalNotPendingError, submitProposalFeedback } from "@/lib/proposals/service";
import { db } from "@/lib/db";

type Context = { params: Promise<{ proposalId: string }> };

export async function POST(request: Request, context: Context) {
  const { proposalId } = await context.params;

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return apiError(400, "invalid_json", "Request body must be valid JSON.");
  }
  const parsed = submitProposalFeedbackSchema.safeParse(payload);
  if (!parsed.success) {
    return apiError(422, "validation_failed", "The feedback could not be submitted.", formatZodIssues(parsed.error));
  }

  const proposal = await db.proposal.findUnique({
    where: { id: proposalId },
    select: { id: true, organizationId: true, clientId: true },
  });
  if (!proposal) return apiError(404, "not_found", `Proposal ${proposalId} not found`);

  try {
    const session = await authenticateClientSession(request);

    if (session.ok) {
      if (session.context.organizationId !== proposal.organizationId || session.context.clientId !== proposal.clientId) {
        return apiError(404, "not_found", `Proposal ${proposalId} not found`);
      }
    } else {
      const token = extractToken(request);
      if (!token) return apiError(401, "unauthorized", "A portal session or approval token is required.");
      const { clientId } = await peekActionToken(token, ClientActionTokenPurpose.PROPOSAL_ACCEPTANCE, proposalId);
      if (clientId !== proposal.clientId) throw new ProposalClientMismatchError(proposalId);
    }

    const result = await submitProposalFeedback(proposal.organizationId, proposalId, parsed.data.feedback);
    return Response.json({ data: result });
  } catch (error) {
    if (error instanceof InvalidActionTokenError) return apiError(401, "invalid_token", error.message);
    if (error instanceof ProposalNotFoundError) return apiError(404, "not_found", error.message);
    if (error instanceof ProposalNotPendingError) return apiError(409, "not_pending", error.message);
    if (error instanceof ProposalClientMismatchError) return apiError(404, "not_found", `Proposal ${proposalId} not found`);
    throw error;
  }
}
