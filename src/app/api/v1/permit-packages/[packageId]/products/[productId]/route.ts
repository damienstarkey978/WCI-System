/**
 * DELETE /api/v1/permit-packages/{packageId}/products/{productId}
 */

import { apiError, withApiAuth } from "@/lib/api-auth";
import { PermitPackageError } from "@/lib/permitting/packages";
import { removePackageProduct } from "@/lib/permitting/package-products";

type Context = { params: Promise<{ packageId: string; productId: string }> };

export const DELETE = withApiAuth<Context>(
  ["permits:write"],
  async (_request, auth, context) => {
    const { packageId, productId } = await context.params;
    try {
      await removePackageProduct(auth.organizationId, packageId, productId);
      return new Response(null, { status: 204 });
    } catch (error) {
      if (error instanceof PermitPackageError) {
        return apiError(
          error.code === "not_found" ? 404 : 400,
          error.code ?? "error",
          error.message,
        );
      }
      throw error;
    }
  },
);
