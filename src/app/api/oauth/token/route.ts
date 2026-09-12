/**
 * POST /api/oauth/token — redeem an authorization code, or refresh an access token.
 *
 * Form-encoded, per OAuth. Client credentials arrive either in the body
 * (client_secret_post) or in a Basic authorization header (client_secret_basic); a
 * public client sends neither and is bound to its code by PKCE alone.
 */

import { corsHeaders, preflight } from "@/lib/oauth/cors";
import { OAuthError, exchangeAuthorizationCode, refreshAccessToken, type TokenResponse } from "@/lib/oauth/service";

export const dynamic = "force-dynamic";

const CORS = corsHeaders("POST");

export async function OPTIONS(): Promise<Response> {
  return preflight("POST");
}

/**
 * OAuth specifies form encoding, and most clients send it. A few send JSON instead —
 * a wrong content type is a mistake worth absorbing rather than answering with a 400
 * that gives a connector nothing to go on.
 */
async function readParameters(request: Request): Promise<Map<string, string> | null> {
  const contentType = request.headers.get("content-type") ?? "";
  try {
    if (contentType.includes("application/json")) {
      const body = (await request.json()) as Record<string, unknown>;
      return new Map(
        Object.entries(body)
          .filter(([, value]) => typeof value === "string" && value.length > 0)
          .map(([key, value]) => [key, value as string]),
      );
    }
    const form = await request.formData();
    const entries: [string, string][] = [];
    for (const [key, value] of form.entries()) {
      if (typeof value === "string" && value.length > 0) entries.push([key, value]);
    }
    return new Map(entries);
  } catch {
    return null;
  }
}

/** Client credentials from a Basic header, when that is how the client sends them. */
function basicCredentials(request: Request): { clientId: string; clientSecret: string } | null {
  const header = request.headers.get("authorization");
  const match = header ? /^Basic\s+(.+)$/i.exec(header.trim()) : null;
  if (!match) return null;
  const decoded = Buffer.from(match[1], "base64").toString("utf8");
  const separator = decoded.indexOf(":");
  if (separator === -1) return null;
  return {
    clientId: decodeURIComponent(decoded.slice(0, separator)),
    clientSecret: decodeURIComponent(decoded.slice(separator + 1)),
  };
}

function tokenResponse(tokens: TokenResponse): Response {
  return Response.json(
    {
      access_token: tokens.accessToken,
      token_type: "Bearer",
      expires_in: tokens.expiresIn,
      refresh_token: tokens.refreshToken,
      scope: tokens.scopes.join(" "),
    },
    // A token response must never be cached, by anything, anywhere.
    { headers: { ...CORS, "cache-control": "no-store", pragma: "no-cache" } },
  );
}

export async function POST(request: Request): Promise<Response> {
  const parameters = await readParameters(request);
  if (!parameters) {
    return Response.json(
      { error: "invalid_request", error_description: "Body must be form-encoded or JSON." },
      { status: 400, headers: CORS },
    );
  }

  const field = (name: string): string | null => parameters.get(name) ?? null;

  const basic = basicCredentials(request);
  const clientId = basic?.clientId ?? field("client_id");
  const clientSecret = basic?.clientSecret ?? field("client_secret");
  const grantType = field("grant_type");

  if (!clientId) {
    return Response.json(
      { error: "invalid_client", error_description: "client_id is required." },
      { status: 401, headers: CORS },
    );
  }

  try {
    if (grantType === "authorization_code") {
      const code = field("code");
      const redirectUri = field("redirect_uri");
      const codeVerifier = field("code_verifier");
      if (!code || !redirectUri || !codeVerifier) {
        throw new OAuthError("invalid_request", "code, redirect_uri and code_verifier are all required.");
      }
      return tokenResponse(await exchangeAuthorizationCode({ code, clientId, clientSecret, redirectUri, codeVerifier }));
    }

    if (grantType === "refresh_token") {
      const refreshToken = field("refresh_token");
      if (!refreshToken) throw new OAuthError("invalid_request", "refresh_token is required.");
      return tokenResponse(await refreshAccessToken({ refreshToken, clientId, clientSecret }));
    }

    throw new OAuthError("unsupported_grant_type", `grant_type "${grantType ?? "(missing)"}" is not supported.`);
  } catch (error) {
    if (error instanceof OAuthError) {
      return Response.json(
        { error: error.code, error_description: error.message },
        { status: error.status, headers: { ...CORS, "cache-control": "no-store" } },
      );
    }
    console.error("[oauth] token request failed", error);
    return Response.json(
      { error: "server_error", error_description: "Token request failed." },
      { status: 500, headers: CORS },
    );
  }
}
