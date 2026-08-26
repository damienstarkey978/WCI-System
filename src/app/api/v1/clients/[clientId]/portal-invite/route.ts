/**
 * /api/v1/clients/[clientId]/portal-invite — issue a one-time portal login
 * link. Returned exactly once, same convention as ApiKey issuance
 * (src/lib/api-auth.ts) — the caller (Heather, or a staff member) is
 * responsible for getting it to the client (email, text, etc.); WCI OS has no
 * email provider wired up yet (CLAUDE.md 7).
 */

import { apiError, withApiAuth } from "@/lib/api-auth";
import { ClientNotFoundError, issuePortalLoginInvite } from "@/lib/client-portal/auth";

type Context = { params: Promise<{ clientId: string }> };

export const POST = withApiAuth<Context>(["clients:write"], async (_request, auth, context) => {
  const { clientId } = await context.params;

  try {
    const { token } = await issuePortalLoginInvite(auth.organizationId, clientId);
    return Response.json({ data: { token } }, { status: 201 });
  } catch (error) {
    if (error instanceof ClientNotFoundError) return apiError(404, "not_found", error.message);
    throw error;
  }
});
