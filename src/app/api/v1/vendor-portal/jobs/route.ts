/** GET /api/v1/vendor-portal/jobs — jobs this logged-in vendor has any access to. */

import { apiError } from "@/lib/api-auth";
import { authenticateVendorSession } from "@/lib/vendor-portal/auth";
import { db } from "@/lib/db";

export async function GET(request: Request) {
  const auth = await authenticateVendorSession(request);
  if (!auth.ok) return apiError(401, "unauthorized", "A valid portal session is required.");

  const access = await db.vendorJobAccess.findMany({
    where: { vendorId: auth.context.vendorId },
    include: { job: { select: { id: true, name: true, status: true, addressLine1: true, city: true, state: true } } },
  });

  return Response.json({ data: access.map((row) => ({ job: row.job, access: row })) });
}
