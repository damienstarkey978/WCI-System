/**
 * POST /api/v1/portal/login — exchange a portal invite (or re-login) token for
 * a ClientSession. The token travels as the Authorization: Bearer header, not
 * the body — see the comment on portalApproveChangeOrderSchema in
 * src/lib/api-schemas.ts for why.
 */

import { apiError, extractToken } from "@/lib/api-auth";
import { InvalidActionTokenError, loginWithToken } from "@/lib/client-portal/auth";

export async function POST(request: Request) {
  const token = extractToken(request);
  if (!token) return apiError(401, "unauthorized", "A portal login token is required.");

  try {
    const { sessionToken, client } = await loginWithToken(token);
    return Response.json({ data: { sessionToken, clientId: client.clientId } });
  } catch (error) {
    if (error instanceof InvalidActionTokenError) {
      return apiError(401, "invalid_token", error.message);
    }
    throw error;
  }
}
