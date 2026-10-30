/**
 * /api/mcp — MCP Connection (handoff.ai feature-parity pass).
 *
 * Lets an external MCP client (Claude Desktop, ChatGPT, etc.) connect to WCI OS over
 * the Streamable HTTP transport, authenticated with an API key minted at
 * /settings/api-keys. Stateless by design (no sessionIdGenerator): each request gets
 * its own McpServer + transport built fresh from that request's auth context — there
 * is no server-side session to keep alive between calls, which also means this route
 * needs no cleanup path and behaves correctly under Next.js's per-request serverless
 * model. Tool availability is scoped per-key (src/lib/mcp/tools.ts); the key's
 * scopes are re-checked on every request, same as /api/v1.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";

import type { ApiKeyContext } from "@/lib/api-auth";
import {
  apiKeyContextFromOAuth,
  authenticateApiKey,
  extractToken,
  parseApiKeyToken,
} from "@/lib/api-auth";
import { buildMcpServer } from "@/lib/mcp/tools";
import { corsHeaders, preflight } from "@/lib/oauth/cors";
import { originOf } from "@/lib/oauth/metadata";
import { authenticateOAuthAccessToken } from "@/lib/oauth/service";

export const dynamic = "force-dynamic";

/**
 * A 401 here is not a dead end: it is how a client discovers where to authorize.
 * RFC 9728 has the resource point at its own metadata in the WWW-Authenticate header,
 * and that one header is the whole difference between "this server rejected me" and a
 * connector that walks itself through registration and consent.
 */
function unauthorizedWithDiscovery(request: Request): Response {
  const resourceMetadata = `${originOf(request)}/.well-known/oauth-protected-resource`;
  return Response.json(
    { jsonrpc: "2.0", error: { code: -32001, message: "Unauthorized" }, id: null },
    {
      status: 401,
      headers: {
        ...CORS,
        "www-authenticate": `Bearer realm="WCI OS", resource_metadata="${resourceMetadata}"`,
      },
    },
  );
}

/**
 * Two ways in, one context out. An API key is a shared machine credential; an OAuth
 * token belongs to a person who approved a named application. Both end up as the same
 * scoped organization context, so the tool registry never has to care which was used.
 *
 * When the OAuth grant is bound to a bot ApiKey (`actingApiKeyId`, e.g. heather),
 * attribution uses that key's name/agentKind — not the OAuth client display name
 * ("Cursor"). Prefer configuring MCP with the bot API key bearer directly when the
 * client supports it; binding covers Cursor's OAuth reconnect path.
 */
async function authenticate(request: Request): Promise<ApiKeyContext | null> {
  const token = extractToken(request);
  if (!token) return null;

  // Same order as authenticateMachineRequest: wci_* before wcia_*.
  if (parseApiKeyToken(token)) {
    const apiKey = await authenticateApiKey(request);
    return apiKey.ok ? apiKey.context : null;
  }

  const oauth = await authenticateOAuthAccessToken(token);
  if (oauth) return apiKeyContextFromOAuth(oauth);

  return null;
}

const CORS = corsHeaders("POST, GET, DELETE");

export async function OPTIONS(): Promise<Response> {
  return preflight("POST, GET, DELETE");
}

function methodNotAllowed(): Response {
  return Response.json(
    { jsonrpc: "2.0", error: { code: -32000, message: "Method not allowed. Use POST for MCP requests." }, id: null },
    { status: 405, headers: CORS },
  );
}

export async function POST(request: Request): Promise<Response> {
  const auth = await authenticate(request);
  if (!auth) return unauthorizedWithDiscovery(request);

  const bearerToken = extractToken(request);
  if (!bearerToken) return unauthorizedWithDiscovery(request);

  let server: McpServer | undefined;
  // enableJsonResponse: every tool here resolves in one shot with no server-initiated
  // notifications, so a plain JSON response is sufficient — and it lets this handler
  // safely close the transport/server the moment handleRequest resolves, with no SSE
  // stream left dangling past the request's lifetime (this route is stateless: a new
  // server + transport is built per request, so there is nothing to keep alive between calls).
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  try {
    // Forward the same bearer to /api/v1 via api_v1_request — one auth model, no
    // parallel write path (see docs/agent-access-atlas-roy-heather.md).
    server = buildMcpServer(auth, { origin: originOf(request), bearerToken });
    await server.connect(transport);
    const response = await transport.handleRequest(request);
    // The transport builds its own response, so the cross-origin headers have to be
    // added to it rather than declared alongside it.
    for (const [header, value] of Object.entries(CORS)) response.headers.set(header, value);
    return response;
  } catch (error) {
    console.error("Error handling MCP request:", error);
    return Response.json(
      { jsonrpc: "2.0", error: { code: -32603, message: "Internal server error" }, id: null },
      { status: 500, headers: CORS },
    );
  } finally {
    await transport.close();
    await server?.close();
  }
}

/**
 * Streamable HTTP allows a GET that opens a server-to-client stream. This server is
 * stateless and never initiates anything, so there is nothing to stream — but an
 * unauthenticated GET still answers with the discovery header, because some clients
 * probe with GET before they have a token and would otherwise never find the
 * authorization server.
 */
export async function GET(request: Request): Promise<Response> {
  if (!(await authenticate(request))) return unauthorizedWithDiscovery(request);
  return methodNotAllowed();
}

export async function DELETE(): Promise<Response> {
  return methodNotAllowed();
}
