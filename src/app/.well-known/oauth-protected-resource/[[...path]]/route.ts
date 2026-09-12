/**
 * GET /.well-known/oauth-protected-resource (RFC 9728).
 *
 * The optional catch-all is not decoration: when a protected resource lives at a path,
 * the spec has clients look for its metadata at that path appended to the well-known
 * prefix — so /api/mcp is discovered at /.well-known/oauth-protected-resource/api/mcp.
 * Clients differ on which form they try, and there is one resource either way.
 */

import { preflight } from "@/lib/oauth/cors";
import { metadataResponse, originOf, protectedResourceMetadata } from "@/lib/oauth/metadata";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  return metadataResponse(protectedResourceMetadata(originOf(request)));
}

export async function OPTIONS(): Promise<Response> {
  return preflight("GET");
}
