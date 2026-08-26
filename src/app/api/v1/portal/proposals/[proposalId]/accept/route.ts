/**
 * POST /api/v1/portal/proposals/[proposalId]/accept — the client-facing side
 * of acceptProposal(). Same dual-auth shape as the Change Order/Selection
 * approval endpoints: a portal session, or a single-use PROPOSAL_ACCEPTANCE
 * token scoped to this exact proposal (the headless e-sign path).
 *
 * Deliberately no ClientJobAccess gate: at PRE_SALE the client usually has no
 * job access yet — signing the proposal is what leads to being granted any
 * (a separate, later staff action), not a precondition for it.
 */

import { ClientActionTokenPurpose } from "@/generated/prisma/enums";
import { apiError, extractToken } from "@/lib/api-auth";
import { formatZodIssues, portalAcceptProposalSchema } from "@/lib/api-schemas";
import { authenticateClientSession, InvalidActionTokenError, redeemActionToken } from "@/lib/client-portal/auth";
import {
  acceptProposal,
  ProposalClientMismatchError,
  ProposalNotFoundError,
  ProposalNotPendingError,
} from "@/lib/proposals/service";
import { db } from "@/lib/db";

type Context = { params: Promise<{ proposalId: string }> };

function clientIp(request: Request): string | undefined {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? undefined;
}

export async function POST(request: Request, context: Context) {
  const { proposalId } = await context.params;

  let payload: unknown = {};
  const rawBody = await request.text();
  if (rawBody.length > 0) {
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return apiError(400, "invalid_json", "Request body must be valid JSON.");
    }
  }
  const parsed = portalAcceptProposalSchema.safeParse(payload);
  if (!parsed.success) {
    return apiError(422, "validation_failed", "The proposal could not be accepted.", formatZodIssues(parsed.error));
  }

  const proposal = await db.proposal.findUnique({
    where: { id: proposalId },
    select: { id: true, organizationId: true, clientId: true },
  });
  if (!proposal) return apiError(404, "not_found", `Proposal ${proposalId} not found`);

  try {
    const session = await authenticateClientSession(request);

    let result;
    if (session.ok) {
      if (session.context.organizationId !== proposal.organizationId || session.context.clientId !== proposal.clientId) {
        return apiError(404, "not_found", `Proposal ${proposalId} not found`);
      }
      result = await acceptProposal({
        organizationId: proposal.organizationId,
        proposalId,
        clientSignatureName: parsed.data.clientSignatureName,
        clientSignatureIp: clientIp(request),
      });
    } else {
      const token = extractToken(request);
      if (!token) return apiError(401, "unauthorized", "A portal session or approval token is required.");
      result = await redeemActionToken(token, ClientActionTokenPurpose.PROPOSAL_ACCEPTANCE, proposalId, (clientId) => {
        if (clientId !== proposal.clientId) throw new ProposalClientMismatchError(proposalId);
        return acceptProposal({
          organizationId: proposal.organizationId,
          proposalId,
          clientSignatureName: parsed.data.clientSignatureName,
          clientSignatureIp: clientIp(request),
        });
      });
    }

    return Response.json({ data: result });
  } catch (error) {
    if (error instanceof InvalidActionTokenError) return apiError(401, "invalid_token", error.message);
    if (error instanceof ProposalNotFoundError) return apiError(404, "not_found", error.message);
    if (error instanceof ProposalNotPendingError) return apiError(409, "not_pending", error.message);
    if (error instanceof ProposalClientMismatchError) return apiError(404, "not_found", `Proposal ${proposalId} not found`);
    throw error;
  }
}
