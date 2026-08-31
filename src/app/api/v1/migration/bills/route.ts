/**
 * POST /api/v1/migration/bills — bulk-import historical Bills from Buildertrend,
 * carrying their real approvalStatus (typically PAID) and paidAt directly instead of
 * being forced through IN_REVIEW → APPROVED → READY_FOR_PAYMENT → PAID one step at a
 * time. See src/lib/migration/service.ts for the full rationale.
 */

import { apiError, withApiAuth } from "@/lib/api-auth";
import { formatZodIssues, importBillsSchema } from "@/lib/api-schemas";
import { importBill } from "@/lib/migration/service";

export const POST = withApiAuth(["migration:write"], async (request, auth) => {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return apiError(400, "invalid_json", "Request body must be valid JSON.");
  }

  const parsed = importBillsSchema.safeParse(payload);
  if (!parsed.success) {
    return apiError(422, "validation_failed", "Could not import bills.", formatZodIssues(parsed.error));
  }

  // Sequential — see src/app/api/v1/migration/daily-logs/route.ts for why.
  const results: Array<{ index: number; status: "success" | "error"; billId?: string; totalCents?: number; error?: string }> = [];
  for (const [index, input] of parsed.data.bills.entries()) {
    try {
      const bill = await importBill({ organizationId: auth.organizationId, ...input });
      results.push({ index, status: "success", billId: bill.id, totalCents: bill.totalCents });
    } catch (error) {
      results.push({ index, status: "error", error: error instanceof Error ? error.message : "Unknown error" });
    }
  }

  return Response.json({ data: results });
});
