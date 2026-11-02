/**
 * POST /api/v1/bills/quickbooks-push-preview — Money rule 4 dry-run.
 * Lists what syncBillToQuickBooks would create/update/link/refuse.
 * Never POSTs to QuickBooks. Safe while QBO_BILL_PUSH_ENABLED is unset.
 */

import { apiError, withApiAuth } from "@/lib/api-auth";
import { billQuickBooksPushPreviewSchema, formatZodIssues } from "@/lib/api-schemas";
import { previewBillQuickBooksPush } from "@/lib/quickbooks/sync/bill-push-preview";

export const POST = withApiAuth(["bills:read"], async (request, auth) => {
  let payload: unknown = {};
  try {
    const text = await request.text();
    if (text.trim()) payload = JSON.parse(text);
  } catch {
    return apiError(400, "invalid_json", "Request body must be valid JSON.");
  }

  const parsed = billQuickBooksPushPreviewSchema.safeParse(payload);
  if (!parsed.success) {
    return apiError(422, "validation_failed", "Invalid push preview request.", formatZodIssues(parsed.error));
  }

  const preview = await previewBillQuickBooksPush(auth.organizationId, parsed.data.billIds);
  return Response.json({
    data: preview,
    meta: {
      note: "Dry-run only — no QuickBooks bills were created. Pause (QBO_BILL_PUSH_ENABLED) may stay off.",
      wouldCreateCount: preview.wouldCreateCount,
      wouldCreateDollars: (preview.wouldCreateCents / 100).toFixed(2),
    },
  });
});
