/** GET /api/v1/clients/{clientId} — fetch one Client Portal contact. */

import { apiError, withApiAuth } from "@/lib/api-auth";
import { db } from "@/lib/db";

type Context = { params: Promise<{ clientId: string }> };

export const GET = withApiAuth<Context>(["clients:read"], async (_request, auth, context) => {
  const { clientId } = await context.params;
  const client = await db.client.findFirst({
    where: { id: clientId, organizationId: auth.organizationId },
    include: { jobAccess: true },
  });
  if (!client) return apiError(404, "not_found", `Client ${clientId} not found.`);
  return Response.json({ data: client });
});
