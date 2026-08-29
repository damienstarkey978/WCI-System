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

import { authenticateApiKey, unauthorized } from "@/lib/api-auth";
import { buildMcpServer } from "@/lib/mcp/tools";

export const dynamic = "force-dynamic";

function methodNotAllowed(): Response {
  return Response.json(
    { jsonrpc: "2.0", error: { code: -32000, message: "Method not allowed. Use POST for MCP requests." }, id: null },
    { status: 405 },
  );
}

export async function POST(request: Request): Promise<Response> {
  const auth = await authenticateApiKey(request);
  if (!auth.ok) return unauthorized();

  let server: McpServer | undefined;
  // enableJsonResponse: every tool here resolves in one shot with no server-initiated
  // notifications, so a plain JSON response is sufficient — and it lets this handler
  // safely close the transport/server the moment handleRequest resolves, with no SSE
  // stream left dangling past the request's lifetime (this route is stateless: a new
  // server + transport is built per request, so there is nothing to keep alive between calls).
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  try {
    server = buildMcpServer(auth.context);
    await server.connect(transport);
    return await transport.handleRequest(request);
  } catch (error) {
    console.error("Error handling MCP request:", error);
    return Response.json(
      { jsonrpc: "2.0", error: { code: -32603, message: "Internal server error" }, id: null },
      { status: 500 },
    );
  } finally {
    await transport.close();
    await server?.close();
  }
}

export async function GET(): Promise<Response> {
  return methodNotAllowed();
}

export async function DELETE(): Promise<Response> {
  return methodNotAllowed();
}
