/**
 * POST /api/v1/takeoffs/{takeoffId}/push-to-purchase-order — explicit conversion to PO.
 */

import { apiError, withApiAuth } from "@/lib/api-auth";
import { formatZodIssues, pushTakeoffToPurchaseOrderSchema } from "@/lib/api-schemas";
import { DuplicatePoNumberError } from "@/lib/purchase-orders/service";
import {
  pushTakeoffToPurchaseOrder,
  TakeoffLineNotFoundError,
  TakeoffLinesNotConvertibleError,
  TakeoffNotFoundError,
} from "@/lib/takeoffs/service";

type Context = { params: Promise<{ takeoffId: string }> };

export const POST = withApiAuth<Context>(
  ["takeoffs:write", "purchase-orders:write"],
  async (request, auth, context) => {
    const { takeoffId } = await context.params;
    let payload: unknown;
    try {
      payload = await request.json();
    } catch {
      return apiError(400, "invalid_json", "Request body must be valid JSON.");
    }

    const parsed = pushTakeoffToPurchaseOrderSchema.safeParse(payload);
    if (!parsed.success) {
      return apiError(422, "validation_failed", "Could not push takeoff to PO.", formatZodIssues(parsed.error));
    }

    try {
      const purchaseOrder = await pushTakeoffToPurchaseOrder({
        organizationId: auth.organizationId,
        takeoffId,
        ...parsed.data,
      });
      return Response.json({ data: purchaseOrder }, { status: 201 });
    } catch (error) {
      if (error instanceof TakeoffNotFoundError) return apiError(404, "not_found", error.message);
      if (error instanceof TakeoffLineNotFoundError) return apiError(422, "unknown_lines", error.message);
      if (error instanceof TakeoffLinesNotConvertibleError) {
        return apiError(409, "not_convertible", error.message);
      }
      if (error instanceof DuplicatePoNumberError) {
        return apiError(409, "duplicate_po_number", error.message);
      }
      throw error;
    }
  },
);
