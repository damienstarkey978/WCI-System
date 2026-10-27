/**
 * POST /api/v1/purchasing-intents/{intentId}/claim — Duke claims a queued intent.
 */

import { apiError, withApiAuth } from "@/lib/api-auth";
import {
  claimPurchasingIntent,
  PurchasingIntentNotConvertibleError,
  PurchasingIntentNotFoundError,
} from "@/lib/takeoffs/service";

type Context = { params: Promise<{ intentId: string }> };

export const POST = withApiAuth<Context>(["takeoffs:write"], async (_request, auth, context) => {
  const { intentId } = await context.params;
  try {
    const intent = await claimPurchasingIntent({
      organizationId: auth.organizationId,
      intentId,
      apiKeyId: auth.apiKeyId,
    });
    return Response.json({ data: intent });
  } catch (error) {
    if (error instanceof PurchasingIntentNotFoundError) return apiError(404, "not_found", error.message);
    if (error instanceof PurchasingIntentNotConvertibleError) {
      return apiError(409, "not_convertible", error.message);
    }
    throw error;
  }
});
