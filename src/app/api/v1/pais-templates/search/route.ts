/**
 * GET /api/v1/pais-templates/search — org PAIS template search (AND + exact model rank).
 * Does not invent FL numbers; returns only stored templates.
 */

import { withApiAuth } from "@/lib/api-auth";
import { searchPaisTemplates } from "@/lib/permitting/package-products";

export const GET = withApiAuth(["permits:read"], async (request, auth) => {
  const url = new URL(request.url);
  const rows = await searchPaisTemplates(auth.organizationId, {
    q: url.searchParams.get("q") ?? undefined,
    manufacturer: url.searchParams.get("manufacturer") ?? undefined,
    model: url.searchParams.get("model") ?? undefined,
    approvalNumber: url.searchParams.get("approvalNumber") ?? undefined,
    hideExpiredQa: url.searchParams.get("hideExpiredQa") === "true",
  });
  return Response.json({ data: rows });
});
