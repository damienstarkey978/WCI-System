/**
 * /api/v1/certifications/expiring — certifications/insurance expiring soon
 * across every vendor. The seam a scheduled reminder job will eventually poll
 * (CLAUDE.md 7) — no reminder delivery exists yet.
 */

import { apiError, withApiAuth } from "@/lib/api-auth";
import { listExpiringCertifications } from "@/lib/vendor-portal/service";

export const GET = withApiAuth(["vendors:read"], async (request, auth) => {
  const withinDaysParam = new URL(request.url).searchParams.get("withinDays");
  const withinDays = withinDaysParam ? Number(withinDaysParam) : undefined;
  if (withinDays !== undefined && (!Number.isInteger(withinDays) || withinDays < 1 || withinDays > 365)) {
    return apiError(400, "invalid_query", "withinDays must be an integer between 1 and 365.");
  }

  const certifications = await listExpiringCertifications(auth.organizationId, withinDays);
  return Response.json({ data: certifications });
});
