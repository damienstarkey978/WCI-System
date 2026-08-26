/** GET /api/v1/vendor-portal/jobs/[jobId]/purchase-orders — this vendor's own POs on the job. */

import { authenticatePortalJobRequest, portalAuthErrorResponse } from "@/lib/vendor-portal/auth";
import { db } from "@/lib/db";

type Context = { params: Promise<{ jobId: string }> };

export async function GET(request: Request, context: Context) {
  const { jobId } = await context.params;

  try {
    const vendor = await authenticatePortalJobRequest(request, jobId, "canViewPurchaseOrders");

    const purchaseOrders = await db.purchaseOrder.findMany({
      where: { organizationId: vendor.organizationId, jobId, vendorId: vendor.vendorId },
      orderBy: { createdAt: "desc" },
      take: 200,
      include: { lineItems: { orderBy: { sortOrder: "asc" } } },
    });

    return Response.json({ data: purchaseOrders });
  } catch (error) {
    const response = portalAuthErrorResponse(error);
    if (response) return response;
    throw error;
  }
}
