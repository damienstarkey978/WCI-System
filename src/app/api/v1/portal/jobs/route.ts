/** GET /api/v1/portal/jobs — jobs this logged-in client has any access to. */

import { apiError } from "@/lib/api-auth";
import { authenticateClientSession } from "@/lib/client-portal/auth";
import { db } from "@/lib/db";

export async function GET(request: Request) {
  const auth = await authenticateClientSession(request);
  if (!auth.ok) return apiError(401, "unauthorized", "A valid portal session is required.");

  const access = await db.clientJobAccess.findMany({
    where: { clientId: auth.context.clientId },
    include: { job: { select: { id: true, name: true, status: true, addressLine1: true, city: true, state: true } } },
  });

  return Response.json({ data: access.map((row) => ({ job: row.job, access: row })) });
}
