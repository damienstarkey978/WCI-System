/**
 * Cross-origin headers for the OAuth and MCP endpoints.
 *
 * Part of connecting an assistant happens in the person's own browser — discovery
 * documents get fetched, and a connector's setup page can call the token endpoint
 * directly. A browser will not even send those requests without a preflight answer,
 * and a failed preflight surfaces as nothing at all: no error in the response, just a
 * connector that never finishes. Cheap to answer, expensive to leave out.
 *
 * Open to any origin on purpose. These endpoints are either public documents or
 * protected by a credential in the request itself, and no cookie is ever used to
 * authorize one — so an allowlist would buy nothing while breaking clients we have no
 * way to enumerate in advance.
 */

const ALLOWED_HEADERS = [
  "authorization",
  "content-type",
  "mcp-protocol-version",
  "mcp-session-id",
  "last-event-id",
].join(", ");

export function corsHeaders(methods: string): Record<string, string> {
  return {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": `${methods}, OPTIONS`,
    "access-control-allow-headers": ALLOWED_HEADERS,
    // Without this a browser client can read the 401 but not the header that tells it
    // where to authorize — which is the only useful thing in that response.
    "access-control-expose-headers": "www-authenticate, mcp-session-id",
    "access-control-max-age": "86400",
  };
}

export function preflight(methods: string): Response {
  return new Response(null, { status: 204, headers: corsHeaders(methods) });
}
