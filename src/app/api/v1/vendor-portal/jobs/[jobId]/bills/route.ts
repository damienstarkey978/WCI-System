/**
 * GET /api/v1/vendor-portal/jobs/[jobId]/bills — this vendor's own bills on
 * the job (CLAUDE.md 3: "bill/lien-waiver visibility+payment receipt" —
 * payment receipt itself is a Payment/QBO concern not built yet, so this is
 * visibility only).
 */

import { authenticatePortalJobRequest, portalAuthErrorResponse } from "@/lib/vendor-portal/auth";
import { db } from "@/lib/db";

type Context = { params: Promise<{ jobId: string }> };

export async function GET(request: Request, context: Context) {
  const { jobId } = await context.params;

  try {
    const vendor = await authenticatePortalJobRequest(request, jobId, "canViewBills");

    const bills = await db.bill.findMany({
      where: { organizationId: vendor.organizationId, jobId, vendorId: vendor.vendorId },
      orderBy: { createdAt: "desc" },
      take: 200,
      include: { lineItems: { orderBy: { sortOrder: "asc" } } },
    });

    return Response.json({ data: bills });
  } catch (error) {
    const response = portalAuthErrorResponse(error);
    if (response) return response;
    throw error;
  }
}
