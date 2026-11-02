/**
 * GET /api/v1/permit-packages/{packageId}
 * PATCH /api/v1/permit-packages/{packageId} — merge fieldValues / rename / status
 */

import { apiError, withApiAuth } from "@/lib/api-auth";
import { PermitPackageStatus } from "@/generated/prisma/enums";
import {
  getPermitPackage,
  PermitPackageError,
  setPermitPackageStatus,
  updatePermitPackageFields,
} from "@/lib/permitting/packages";
import { db } from "@/lib/db";

type Context = { params: Promise<{ packageId: string }> };

export const GET = withApiAuth<Context>(["permits:read"], async (_request, auth, context) => {
  const { packageId } = await context.params;
  try {
    const pkg = await getPermitPackage(auth.organizationId, packageId);
    return Response.json({ data: pkg });
  } catch (error) {
    if (error instanceof PermitPackageError) {
      return apiError(error.code === "not_found" ? 404 : 400, error.code ?? "error", error.message);
    }
    throw error;
  }
});

export const PATCH = withApiAuth<Context>(["permits:write"], async (request, auth, context) => {
  const { packageId } = await context.params;
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return apiError(400, "invalid_json", "Request body must be valid JSON.");
  }
  const body = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};

  try {
    if (typeof body.name === "string" && body.name.trim()) {
      await getPermitPackage(auth.organizationId, packageId);
      await db.permitPackage.update({
        where: { id: packageId },
        data: { name: body.name.trim() },
      });
    }
    if (typeof body.status === "string") {
      const status = body.status as PermitPackageStatus;
      if (!Object.values(PermitPackageStatus).includes(status)) {
        return apiError(400, "invalid_status", "Invalid package status.");
      }
      await setPermitPackageStatus(auth.organizationId, packageId, status);
    }
    if (body.fieldValues && typeof body.fieldValues === "object" && !Array.isArray(body.fieldValues)) {
      const fields: Record<string, string> = {};
      for (const [k, v] of Object.entries(body.fieldValues as Record<string, unknown>)) {
        if (typeof v === "string") fields[k] = v;
      }
      await updatePermitPackageFields(auth.organizationId, packageId, fields);
    }
    const pkg = await getPermitPackage(auth.organizationId, packageId);
    return Response.json({ data: pkg });
  } catch (error) {
    if (error instanceof PermitPackageError) {
      return apiError(error.code === "not_found" ? 404 : 400, error.code ?? "error", error.message);
    }
    throw error;
  }
});
