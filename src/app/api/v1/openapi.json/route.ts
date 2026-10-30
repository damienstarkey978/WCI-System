/**
 * GET /api/v1/openapi.json — the one /api/v1 route that does not require an API
 * key (see the exception in src/proxy.ts). An integrator needs to be able to read
 * the contract before they have credentials to call it.
 *
 * ?format=paths — compact path→method→scopes index for MCP clients that truncate.
 * ?format=tags — list of OpenAPI tags.
 * ?tag=Permitting — full (or paths) document filtered to one tag (avoids ~245KB cut).
 */

import { buildOpenApiDocument, buildOpenApiPathIndex, listOpenApiTags } from "@/lib/openapi";

export function GET(request: Request) {
  const url = new URL(request.url);
  const format = url.searchParams.get("format");
  const tag = url.searchParams.get("tag");

  if (format === "tags") {
    return Response.json({
      openapi: "3.1.0",
      info: {
        title: "WCI OS API tags",
        version: "1.0.0",
        description: "Pass ?tag=<name> (or ?format=paths&tag=<name>) to fetch a slice under the MCP size cap.",
      },
      tags: listOpenApiTags(),
    });
  }
  if (format === "paths" || format === "index") {
    return Response.json(buildOpenApiPathIndex(tag));
  }
  return Response.json(buildOpenApiDocument(tag));
}
