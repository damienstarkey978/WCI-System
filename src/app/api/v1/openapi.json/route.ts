/**
 * GET /api/v1/openapi.json — the one /api/v1 route that does not require an API
 * key (see the exception in src/proxy.ts). An integrator needs to be able to read
 * the contract before they have credentials to call it.
 *
 * ?format=paths returns a compact path→method→scopes index for MCP clients
 * that truncate large JSON responses (~11.8KB).
 */

import { buildOpenApiDocument, buildOpenApiPathIndex } from "@/lib/openapi";

export function GET(request: Request) {
  const format = new URL(request.url).searchParams.get("format");
  if (format === "paths" || format === "index") {
    return Response.json(buildOpenApiPathIndex());
  }
  return Response.json(buildOpenApiDocument());
}
