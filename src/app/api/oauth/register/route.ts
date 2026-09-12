/**
 * POST /api/oauth/register — dynamic client registration (RFC 7591).
 *
 * Open, deliberately. ChatGPT and claude.ai register themselves before any person is
 * involved, so there is nobody to authenticate at this point and requiring a
 * credential here would make the connector impossible to set up.
 *
 * Registering is not access. A registration grants nothing: a client can only act
 * after a named person signs in at /oauth/authorize and approves it, and the token
 * that results carries that person's identity and only the scopes an MCP client may
 * hold. The worst an unwanted registration does is leave an unused row.
 */

import { corsHeaders, preflight } from "@/lib/oauth/cors";
import { OAuthError, registerClient } from "@/lib/oauth/service";

export const dynamic = "force-dynamic";

const CORS = corsHeaders("POST");

function oauthError(error: OAuthError): Response {
  return Response.json(
    { error: error.code, error_description: error.message },
    { status: error.status, headers: CORS },
  );
}

export async function OPTIONS(): Promise<Response> {
  return preflight("POST");
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}

export async function POST(request: Request): Promise<Response> {
  let payload: Record<string, unknown>;
  try {
    payload = (await request.json()) as Record<string, unknown>;
  } catch {
    return Response.json(
      { error: "invalid_client_metadata", error_description: "Body must be JSON." },
      { status: 400, headers: CORS },
    );
  }

  try {
    const registered = await registerClient({
      clientName: typeof payload.client_name === "string" && payload.client_name.trim().length > 0
        ? payload.client_name.trim()
        : "Unnamed MCP client",
      redirectUris: asStringArray(payload.redirect_uris),
      tokenEndpointAuthMethod:
        typeof payload.token_endpoint_auth_method === "string" ? payload.token_endpoint_auth_method : undefined,
      clientUri: typeof payload.client_uri === "string" ? payload.client_uri : null,
      logoUri: typeof payload.logo_uri === "string" ? payload.logo_uri : null,
      // RFC 7591 sends scopes as one space-delimited string, not a list.
      scopes: typeof payload.scope === "string" ? payload.scope.split(/\s+/).filter(Boolean) : undefined,
    });

    return Response.json(
      {
        client_id: registered.clientId,
        ...(registered.clientSecret ? { client_secret: registered.clientSecret } : {}),
        client_id_issued_at: registered.issuedAt,
        // 0 means "does not expire" per RFC 7591. Only present alongside a secret.
        ...(registered.clientSecret ? { client_secret_expires_at: 0 } : {}),
        client_name: registered.clientName,
        redirect_uris: registered.redirectUris,
        token_endpoint_auth_method: registered.tokenEndpointAuthMethod,
        grant_types: ["authorization_code", "refresh_token"],
        response_types: ["code"],
        scope: registered.scopes.join(" "),
      },
      { status: 201, headers: CORS },
    );
  } catch (error) {
    if (error instanceof OAuthError) return oauthError(error);
    console.error("[oauth] client registration failed", error);
    return Response.json(
      { error: "server_error", error_description: "Registration failed." },
      { status: 500, headers: CORS },
    );
  }
}
