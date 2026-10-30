/**
 * POST /api/v1/me/acting-api-key — bind the current OAuth grant to a bot ApiKey.
 *
 * Cursor MCP reconnects with OAuth (`wcia_*`) and would otherwise attribute as the
 * client display name ("Cursor"). Presenting a live org ApiKey token (possession)
 * rebinds every live access/refresh token for this grant so subsequent `/me` and
 * writes use that key's name / agentKind / id (e.g. heather, tokenId 74eae97717f2acb7).
 *
 * API-key callers do not need this — they already are the key. Only OAuth bearers
 * may bind. Clears the binding when `apiKeyToken` is null/omitted empty.
 */

import { z } from "zod";

import {
  apiError,
  extractToken,
  parseApiKeyToken,
  secretMatches,
  unauthorized,
} from "@/lib/api-auth";
import { db } from "@/lib/db";
import { authenticateOAuthAccessToken, OAuthError, setGrantActingApiKey } from "@/lib/oauth/service";

const bodySchema = z.object({
  /** Full `wci_<tokenId>_<secret>` of the bot key to attribute as. Empty/null clears. */
  apiKeyToken: z.string().trim().nullable().optional(),
});

export async function POST(request: Request): Promise<Response> {
  const bearer = extractToken(request);
  if (!bearer) return unauthorized();

  // Must be OAuth — an ApiKey caller is already attributed as itself.
  const oauth = await authenticateOAuthAccessToken(bearer);
  if (!oauth) {
    return apiError(
      400,
      "oauth_required",
      "This endpoint rebinds an OAuth MCP grant to a bot API key. Call it with the OAuth access token (wcia_…), not an API key.",
    );
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return apiError(400, "invalid_json", "Request body must be JSON.");
  }

  const parsed = bodySchema.safeParse(payload);
  if (!parsed.success) {
    return apiError(422, "validation_failed", "apiKeyToken must be a string, null, or omitted.");
  }

  const rawToken = parsed.data.apiKeyToken?.trim() || null;
  let actingApiKeyId: string | null = null;
  let actingSummary: { id: string; name: string; agentKind: string | null; tokenId: string; scopes: string[] } | null =
    null;

  if (rawToken) {
    const tokenParts = parseApiKeyToken(rawToken);
    if (!tokenParts) {
      return apiError(422, "invalid_api_key_token", "apiKeyToken must be a wci_<tokenId>_<secret> bearer.");
    }
    const apiKey = await db.apiKey.findUnique({ where: { tokenId: tokenParts.tokenId } });
    if (!apiKey || apiKey.organizationId !== oauth.organizationId) {
      return apiError(404, "api_key_not_found", "No API key in this organization matches that token.");
    }
    if (!secretMatches(tokenParts.secret, apiKey.hashedSecret)) {
      return apiError(401, "invalid_api_key_secret", "apiKeyToken secret does not match.");
    }
    if (apiKey.revokedAt !== null) {
      return apiError(400, "api_key_revoked", "That API key is revoked.");
    }
    if (apiKey.expiresAt !== null && apiKey.expiresAt.getTime() <= Date.now()) {
      return apiError(400, "api_key_expired", "That API key is expired.");
    }
    actingApiKeyId = apiKey.id;
    actingSummary = {
      id: apiKey.id,
      name: apiKey.name,
      agentKind: apiKey.agentKind,
      tokenId: apiKey.tokenId,
      scopes: apiKey.scopes,
    };
  }

  try {
    await setGrantActingApiKey({
      organizationId: oauth.organizationId,
      oauthClientId: oauth.oauthClientId,
      userId: oauth.userId,
      actingApiKeyId,
    });
  } catch (error) {
    if (error instanceof OAuthError) {
      return apiError(error.status, error.code, error.message);
    }
    throw error;
  }

  return Response.json({
    data: {
      bound: actingSummary !== null,
      actingApiKey: actingSummary,
      message: actingSummary
        ? `OAuth grant now attributes as ${actingSummary.name}. GET /me should return that name.`
        : "OAuth grant bot attribution cleared. Writes will use the OAuth client display name.",
    },
  });
}
