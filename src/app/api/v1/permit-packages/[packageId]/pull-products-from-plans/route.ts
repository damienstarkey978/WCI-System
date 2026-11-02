/**
 * POST /api/v1/permit-packages/{packageId}/pull-products-from-plans
 * AI draft of PAIS products from plan notes. Returns suggestions only —
 * does not persist until a separate confirm/add call. Never invents FL#.
 */

import { apiError, withApiAuth } from "@/lib/api-auth";
import { formatZodIssues, pullProductsFromPlansSchema } from "@/lib/api-schemas";
import {
  AiNotConfiguredError,
  DraftGenerationError,
  EmptyPaisTemplateCatalogError,
  PackageNotFoundError,
  pullProductsFromPlans,
} from "@/lib/permitting/pull-products-from-plans";
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

  const parsed = pullProductsFromPlansSchema.safeParse(payload);
  if (!parsed.success) {
    return apiError(
      422,
      "validation_failed",
      "Invalid pull-from-plans request.",
      formatZodIssues(parsed.error),
    );
  }

  try {
    const result = await pullProductsFromPlans(
      auth.organizationId,
      packageId,
      parsed.data.planNotes,
    );
    return Response.json({
      data: {
        assumptions: result.draft.assumptions,
        suggestions: result.suggestions,
      },
    });
  } catch (error) {
    if (error instanceof PackageNotFoundError) {
      return apiError(404, "not_found", error.message);
    }
    if (error instanceof EmptyPaisTemplateCatalogError) {
      return apiError(422, "no_pais_templates", error.message);
    }
    if (error instanceof AiNotConfiguredError) {
      return apiError(503, "ai_not_configured", error.message);
    }
    if (error instanceof DraftGenerationError) {
      return apiError(502, "draft_generation_failed", error.message);
    }
    if (error instanceof PermitPackageError) {
      return apiError(400, error.code ?? "error", error.message);
    }
    throw error;
  }
});
