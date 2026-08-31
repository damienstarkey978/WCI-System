/**
 * POST /api/v1/migration/purchase-orders — bulk-import historical Purchase Orders
 * from Buildertrend, already-approved or already-declined, on any job regardless of
 * its current status. See src/lib/migration/service.ts for why this is a separate
 * surface from POST /api/v1/purchase-orders (which forces every new PO to start
 * DRAFT on a job that still accepts commitments — neither is true of a PO
 * Buildertrend already closed out).
 */

import { apiError, withApiAuth } from "@/lib/api-auth";
import { formatZodIssues, importPurchaseOrdersSchema } from "@/lib/api-schemas";
import { importPurchaseOrder } from "@/lib/migration/service";

export const POST = withApiAuth(["migration:write"], async (request, auth) => {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return apiError(400, "invalid_json", "Request body must be valid JSON.");
  }

  const parsed = importPurchaseOrdersSchema.safeParse(payload);
  if (!parsed.success) {
    return apiError(422, "validation_failed", "Could not import purchase orders.", formatZodIssues(parsed.error));
  }

  // Sequential — see src/app/api/v1/migration/daily-logs/route.ts for why.
  const results: Array<{ index: number; status: "success" | "error"; purchaseOrderId?: string; totalCents?: number; error?: string }> = [];
  for (const [index, input] of parsed.data.purchaseOrders.entries()) {
    try {
      const purchaseOrder = await importPurchaseOrder({ organizationId: auth.organizationId, ...input });
      results.push({ index, status: "success", purchaseOrderId: purchaseOrder.id, totalCents: purchaseOrder.totalCents });
    } catch (error) {
      results.push({ index, status: "error", error: error instanceof Error ? error.message : "Unknown error" });
    }
  }

  return Response.json({ data: results });
});
