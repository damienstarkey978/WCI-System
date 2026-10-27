/**
 * GET /api/v1/purchasing-intents — Duke's purchasing queue (filter by status/job).
 */

import { PurchasingIntentStatus } from "@/generated/prisma/enums";
import { apiError, withApiAuth } from "@/lib/api-auth";
import { formatZodIssues, listPurchasingIntentsQuerySchema } from "@/lib/api-schemas";
import { listPurchasingIntents } from "@/lib/takeoffs/service";

export const GET = withApiAuth(["takeoffs:read"], async (request, auth) => {
  const url = new URL(request.url);
  const parsed = listPurchasingIntentsQuerySchema.safeParse({
    jobId: url.searchParams.get("jobId") ?? undefined,
    status: url.searchParams.get("status") ?? undefined,
    limit: url.searchParams.get("limit") ?? undefined,
  });
  if (!parsed.success) {
    return apiError(422, "validation_failed", "Invalid purchasing-intents query.", formatZodIssues(parsed.error));
  }

  const intents = await listPurchasingIntents(auth.organizationId, {
    jobId: parsed.data.jobId,
    status: parsed.data.status as PurchasingIntentStatus | undefined,
    limit: parsed.data.limit,
  });

  return Response.json({
    data: intents.map((intent) => ({
      id: intent.id,
      status: intent.status,
      jobId: intent.jobId,
      jobName: intent.job.name,
      jobPrefix: intent.job.prefix,
      takeoffId: intent.takeoffId,
      takeoffTitle: intent.takeoff.title,
      takeoffLineId: intent.takeoffLineId,
      title: intent.takeoffLine.title,
      quantityMilli: intent.takeoffLine.quantityMilli,
      unit: intent.takeoffLine.unit,
      unitCostCents: intent.takeoffLine.unitCostCents,
      costCode: intent.takeoffLine.costCode,
      vendorHint: intent.vendorHint,
      notes: intent.notes,
      purchaseOrderId: intent.purchaseOrderId,
      purchaseOrder: intent.purchaseOrder,
      claimedAt: intent.claimedAt?.toISOString() ?? null,
      createdAt: intent.createdAt.toISOString(),
    })),
  });
});
