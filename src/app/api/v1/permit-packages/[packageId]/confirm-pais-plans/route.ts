/**
 * POST /api/v1/permit-packages/{packageId}/confirm-pais-plans
 * Persist staff-confirmed pull-from-plans suggestions. Never invents FL#.
 */

import { apiError, withApiAuth } from "@/lib/api-auth";
import { confirmPaisPlansSuggestionsSchema, formatZodIssues } from "@/lib/api-schemas";
import { confirmPaisPlansSuggestions } from "@/lib/permitting/pull-products-from-plans";
import { PermitPackageError } from "@/lib/permitting/packages";

type Context = { params: Promise<{ packageId: string }> };

export const POST = withApiAuth<Context>(["permits:write"], async (request, auth, context) => {
  const { packageId } = await context.params;
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return apiError(400, "invalid_json", "Request body must be valid JSON.");
  }

  const parsed = confirmPaisPlansSuggestionsSchema.safeParse(payload);
  if (!parsed.success) {
    return apiError(
      422,
      "validation_failed",
      "Invalid confirm-pais-plans request.",
      formatZodIssues(parsed.error),
    );
  }

  try {
    const products = await confirmPaisPlansSuggestions(
      auth.organizationId,
      packageId,
      parsed.data.items,
    );
    return Response.json({ data: products }, { status: 201 });
  } catch (error) {
    if (error instanceof PermitPackageError) {
      return apiError(error.code === "not_found" ? 404 : 400, error.code ?? "error", error.message);
    }
    throw error;
  }
});
