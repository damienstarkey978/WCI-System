/**
 * GET/POST /api/v1/permit-packages/{packageId}/products — PAIS product rows.
 * Never invents Florida approval numbers.
 */

import { apiError, withApiAuth } from "@/lib/api-auth";
import { PermitPackageError } from "@/lib/permitting/packages";
import {
  addPackageProduct,
  addPackageProductFromTemplate,
  listPackageProducts,
} from "@/lib/permitting/package-products";

type Context = { params: Promise<{ packageId: string }> };

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export const GET = withApiAuth<Context>(["permits:read"], async (_request, auth, context) => {
  const { packageId } = await context.params;
  try {
    const products = await listPackageProducts(auth.organizationId, packageId);
    return Response.json({ data: products });
  } catch (error) {
    if (error instanceof PermitPackageError) {
      return apiError(error.code === "not_found" ? 404 : 400, error.code ?? "error", error.message);
    }
    throw error;
  }
});

export const POST = withApiAuth<Context>(["permits:write"], async (request, auth, context) => {
  const { packageId } = await context.params;
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return apiError(400, "invalid_json", "Request body must be valid JSON.");
  }
  const body = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};

  try {
    const templateId = str(body.templateId);
    const product = templateId
      ? await addPackageProductFromTemplate(auth.organizationId, packageId, templateId)
      : await addPackageProduct(auth.organizationId, packageId, {
          manufacturer: str(body.manufacturer),
          model: str(body.model),
          approvalNumber: str(body.approvalNumber),
          category: str(body.category),
          codeVersion: str(body.codeVersion),
          qaExpiration: str(body.qaExpiration),
          notes: str(body.notes),
        });
    return Response.json({ data: product }, { status: 201 });
  } catch (error) {
    if (error instanceof PermitPackageError) {
      return apiError(error.code === "not_found" ? 404 : 400, error.code ?? "error", error.message);
    }
    throw error;
  }
});
