/**
 * GET /api/v1/openapi.json — the one /api/v1 route that does not require an API
 * key (see the exception in src/proxy.ts). An integrator needs to be able to read
 * the contract before they have credentials to call it.
 */

import { buildOpenApiDocument } from "@/lib/openapi";

export function GET() {
  return Response.json(buildOpenApiDocument());
}
