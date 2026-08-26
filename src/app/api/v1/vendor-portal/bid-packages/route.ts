/**
 * GET /api/v1/vendor-portal/bid-packages — bid packages this vendor has been
 * invited to (has a BidSubmission row for). Deliberately not gated by
 * VendorJobAccess — see src/lib/bids/service.ts's file comment.
 */

import { apiError } from "@/lib/api-auth";
import { authenticateVendorSession } from "@/lib/vendor-portal/auth";
import { db } from "@/lib/db";

export async function GET(request: Request) {
  const auth = await authenticateVendorSession(request);
  if (!auth.ok) return apiError(401, "unauthorized", "A valid portal session is required.");

  const submissions = await db.bidSubmission.findMany({
    where: { vendorId: auth.context.vendorId },
    orderBy: { createdAt: "desc" },
    include: {
      bidPackage: { include: { lineItems: { orderBy: { sortOrder: "asc" } }, job: { select: { id: true, name: true } } } },
      lineItems: { orderBy: { sortOrder: "asc" } },
    },
  });

  return Response.json({ data: submissions });
}
