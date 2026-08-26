/** GET /api/v1/portal/jobs/[jobId]/invoices — invoices, with payment history. */

import { authenticatePortalJobRequest, portalAuthErrorResponse } from "@/lib/client-portal/auth";
import { db } from "@/lib/db";

type Context = { params: Promise<{ jobId: string }> };

export async function GET(request: Request, context: Context) {
  const { jobId } = await context.params;

  try {
    const client = await authenticatePortalJobRequest(request, jobId, "canViewInvoices");

    const invoices = await db.invoice.findMany({
      where: { organizationId: client.organizationId, jobId },
      orderBy: { createdAt: "desc" },
      take: 200,
      include: { lineItems: { orderBy: { sortOrder: "asc" } }, payments: { orderBy: { receivedAt: "desc" } } },
    });

    return Response.json({ data: invoices });
  } catch (error) {
    const response = portalAuthErrorResponse(error);
    if (response) return response;
    throw error;
  }
}
