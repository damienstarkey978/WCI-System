/**
 * POST /api/v1/purchasing-intents/{intentId}/convert-to-po — Duke converts intent → PO.
 */

import { apiError, withApiAuth } from "@/lib/api-auth";
import { convertPurchasingIntentSchema, formatZodIssues } from "@/lib/api-schemas";
import { DuplicatePoNumberError } from "@/lib/purchase-orders/service";
import {
  convertPurchasingIntentToPo,
  PurchasingIntentNotConvertibleError,
  PurchasingIntentNotFoundError,
} from "@/lib/takeoffs/service";

type Context = { params: Promise<{ intentId: string }> };

export const POST = withApiAuth<Context>(
  ["takeoffs:write", "purchase-orders:write"],
  async (request, auth, context) => {
    const { intentId } = await context.params;
    let payload: unknown;
    try {
      payload = await request.json();
    } catch {
      return apiError(400, "invalid_json", "Request body must be valid JSON.");
    }

    const parsed = convertPurchasingIntentSchema.safeParse(payload);
    if (!parsed.success) {
      return apiError(422, "validation_failed", "Could not convert intent to PO.", formatZodIssues(parsed.error));
    }

    try {
      const purchaseOrder = await convertPurchasingIntentToPo({
        organizationId: auth.organizationId,
        intentId,
        apiKeyId: auth.apiKeyId,
        ...parsed.data,
      });
      return Response.json({ data: purchaseOrder }, { status: 201 });
    } catch (error) {
      if (error instanceof PurchasingIntentNotFoundError) return apiError(404, "not_found", error.message);
      if (error instanceof PurchasingIntentNotConvertibleError) {
        return apiError(409, "not_convertible", error.message);
      }
      if (error instanceof DuplicatePoNumberError) {
        return apiError(409, "duplicate_po_number", error.message);
      }
      throw error;
    }
  },
);
