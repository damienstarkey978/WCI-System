/**
 * The two discovery documents an MCP client fetches before it can authorize.
 *
 * Both are derived from the incoming request's own origin rather than a configured
 * base URL. The issuer a client sees has to match the host it actually reached, and
 * deriving it means preview deploys and the production domain are each correct
 * without a second setting to keep in step.
 */

import { ACCESS_TOKEN_TTL_SECONDS, advertisedScopes } from "@/lib/oauth/service";

export function originOf(request: Request): string {
  const url = new URL(request.url);
  // Behind a proxy the request URL is the internal one; the forwarded headers say what
  // the client actually asked for, and that is what must appear in the metadata.
  const host = request.headers.get("x-forwarded-host") ?? url.host;
  const proto = request.headers.get("x-forwarded-proto") ?? url.protocol.replace(":", "");
  return `${proto}://${host}`;
}

/** RFC 9728 — what this resource is and who issues tokens for it. */
export function protectedResourceMetadata(origin: string) {
  return {
    resource: `${origin}/api/mcp`,
    authorization_servers: [origin],
    scopes_supported: advertisedScopes(),
    bearer_methods_supported: ["header"],
    resource_name: "WCI OS",
    resource_documentation: `${origin}/api/v1/openapi.json`,
  };
}

/** RFC 8414 — where to register, authorize, and redeem. */
export function authorizationServerMetadata(origin: string) {
  return {
    issuer: origin,
    authorization_endpoint: `${origin}/oauth/authorize`,
    token_endpoint: `${origin}/api/oauth/token`,
    registration_endpoint: `${origin}/api/oauth/register`,
    scopes_supported: advertisedScopes(),
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    // "none" is the public-client case: a desktop or browser client has nowhere to keep
    // a secret, and PKCE rather than a secret is what binds a code to it.
    token_endpoint_auth_methods_supported: ["none", "client_secret_post", "client_secret_basic"],
    code_challenge_methods_supported: ["S256"],
    service_documentation: `${origin}/api/v1/openapi.json`,
    access_token_lifetime_seconds: ACCESS_TOKEN_TTL_SECONDS,
  };
}

/** Metadata is public and cacheable, and clients fetch it on every reconnect. */
export function metadataResponse(body: unknown): Response {
  return Response.json(body, {
    headers: {
      "cache-control": "public, max-age=3600",
      // Clients fetch these from a browser context during the connector setup flow.
      "access-control-allow-origin": "*",
    },
  });
}
