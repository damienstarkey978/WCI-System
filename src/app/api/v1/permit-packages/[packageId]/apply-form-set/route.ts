/**
 * POST /api/v1/permit-packages/{packageId}/apply-form-set
 * Additive: adds missing form keys from a template or explicit formKeys list.
 */

import { apiError, withApiAuth } from "@/lib/api-auth";
import { db } from "@/lib/db";
import {
  applyFormSetToPackage,
  PermitPackageError,
} from "@/lib/permitting/packages";

type Context = { params: Promise<{ packageId: string }> };

export const POST = withApiAuth<Context>(["permits:write"], async (request, auth, context) => {
  const { packageId } = await context.params;
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return apiError(400, "invalid_json", "Request body must be valid JSON.");
  }
  const body = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};

  let formKeys: string[] = [];
  if (typeof body.templateId === "string" && body.templateId.trim()) {
    const tpl = await db.permitFormSetTemplate.findFirst({
      where: { id: body.templateId.trim(), organizationId: auth.organizationId },
    });
    if (!tpl) return apiError(404, "not_found", "Form-set template not found.");
    const keys = Array.isArray(tpl.formKeys) ? tpl.formKeys : [];
    formKeys = keys.filter((k): k is string => typeof k === "string");
  } else if (Array.isArray(body.formKeys)) {
    formKeys = body.formKeys.filter((k): k is string => typeof k === "string" && Boolean(k.trim()));
  } else {
    return apiError(400, "validation_failed", "Provide templateId or formKeys[].");
  }

  try {
    const pkg = await applyFormSetToPackage(auth.organizationId, packageId, formKeys);
    return Response.json({ data: pkg });
  } catch (error) {
    if (error instanceof PermitPackageError) {
      return apiError(error.code === "not_found" ? 404 : 400, error.code ?? "error", error.message);
    }
    throw error;
  }
});
