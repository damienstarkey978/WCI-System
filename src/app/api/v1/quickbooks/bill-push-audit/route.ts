/**
 * GET /api/v1/quickbooks/bill-push-audit — Money rule 9 daily count.
 * Returns successful WCI→QBO bill creates since `since` (default: last 24h).
 * Read-only; does not push anything.
 */

import { apiError, withApiAuth } from "@/lib/api-auth";
import { countSuccessfulBillCreatesToQbo } from "@/lib/quickbooks/sync-log";
import { db } from "@/lib/db";

export const GET = withApiAuth(["bills:read"], async (request, auth) => {
  const url = new URL(request.url);
  const sinceRaw = url.searchParams.get("since");
  let since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  if (sinceRaw) {
    const parsed = new Date(sinceRaw);
    if (Number.isNaN(parsed.getTime())) {
      return apiError(422, "validation_failed", "since must be a valid ISO date.");
    }
    since = parsed;
  }

  const summary = await countSuccessfulBillCreatesToQbo(auth.organizationId, since);
  const recent = await db.qboSyncLog.findMany({
    where: {
      organizationId: auth.organizationId,
      entityType: "BILL",
      direction: "TO_QBO",
      status: "SUCCESS",
      createdAt: { gte: since },
      OR: [{ operation: "create" }, { operation: null }],
    },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true,
      wciRecordId: true,
      qboId: true,
      vendorName: true,
      docNumber: true,
      amountCents: true,
      actorLabel: true,
      operation: true,
      createdAt: true,
    },
  });

  return Response.json({
    data: {
      since: since.toISOString(),
      createCount: summary.count,
      createAmountCents: summary.amountCents,
      createAmountDollars: (summary.amountCents / 100).toFixed(2),
      recentCreates: recent,
    },
    meta: {
      note: "Read-only audit. Damien should see createCount daily; investigate if unexpectedly high.",
    },
  });
});
