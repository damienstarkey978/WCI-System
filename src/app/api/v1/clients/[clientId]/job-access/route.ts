/** /api/v1/clients/[clientId]/job-access — grant/update per-job portal visibility. */

import { apiError, withApiAuth } from "@/lib/api-auth";
import { formatZodIssues, grantJobAccessSchema } from "@/lib/api-schemas";
import { ClientNotFoundError, grantJobAccess, JobNotFoundError } from "@/lib/client-portal/service";

type Context = { params: Promise<{ clientId: string }> };

export const POST = withApiAuth<Context>(["clients:write"], async (request, auth, context) => {
  const { clientId } = await context.params;

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return apiError(400, "invalid_json", "Request body must be valid JSON.");
  }

  const parsed = grantJobAccessSchema.safeParse(payload);
  if (!parsed.success) {
    return apiError(422, "validation_failed", "Job access could not be granted.", formatZodIssues(parsed.error));
  }

  try {
    const access = await grantJobAccess({ organizationId: auth.organizationId, clientId, ...parsed.data });
    return Response.json({ data: access }, { status: 201 });
  } catch (error) {
    if (error instanceof ClientNotFoundError) return apiError(404, "not_found", error.message);
    if (error instanceof JobNotFoundError) return apiError(422, "unknown_job", error.message);
    throw error;
  }
});
