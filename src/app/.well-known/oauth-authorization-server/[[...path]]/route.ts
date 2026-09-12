/**
 * GET /.well-known/oauth-authorization-server (RFC 8414). Catch-all for the same
 * reason as the protected-resource document — clients differ on whether they append
 * the resource path.
 */

import { preflight } from "@/lib/oauth/cors";
import { authorizationServerMetadata, metadataResponse, originOf } from "@/lib/oauth/metadata";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  return metadataResponse(authorizationServerMetadata(originOf(request)));
}

export async function OPTIONS(): Promise<Response> {
  return preflight("GET");
}
