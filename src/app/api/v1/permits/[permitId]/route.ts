/**
 * /api/v1/permits/{permitId} — update permit fields; DELETE removes the permit.
 */

import { apiError, withApiAuth } from "@/lib/api-auth";
import { formatZodIssues, parseOptionalDate, updatePermitSchema } from "@/lib/api-schemas";
import {
  deleteJobPermit,
  PermitNotFoundError,
  updatePermitFields,
} from "@/lib/permitting/service";

type Context = { params: Promise<{ permitId: string }> };

export const DELETE = withApiAuth<Context>(["permits:write"], async (_request, auth, context) => {
  const { permitId } = await context.params;
  try {
    await deleteJobPermit(auth.organizationId, permitId);
    return new Response(null, { status: 204 });
  } catch (error) {
    if (error instanceof PermitNotFoundError) {
      return apiError(404, "not_found", error.message);
    }
    throw error;
  }
});

export const PATCH = withApiAuth<Context>(["permits:write"], async (request, auth, context) => {
  const { permitId } = await context.params;

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return apiError(400, "invalid_json", "Request body must be valid JSON.");
  }

  const parsed = updatePermitSchema.safeParse(payload);
  if (!parsed.success) {
    return apiError(422, "validation_failed", "The permit could not be updated.", formatZodIssues(parsed.error));
  }

  try {
    const permit = await updatePermitFields(auth.organizationId, permitId, {
      pulled: parsed.data.pulled,
      vendorId: parsed.data.vendorId,
      permitNumber: parsed.data.permitNumber,
      label: parsed.data.label,
      trade: parsed.data.trade,
      status: parsed.data.status,
      issuedAt: parseOptionalDate(parsed.data.issuedAt),
      expiresAt: parseOptionalDate(parsed.data.expiresAt),
      jurisdiction: parsed.data.jurisdiction,
      contractorName: parsed.data.contractorName,
    });
    return Response.json({ data: permit });
  } catch (error) {
    if (error instanceof PermitNotFoundError) {
      return apiError(404, "not_found", error.message);
    }
    if (error instanceof Error && error.message === "Vendor not found.") {
      return apiError(422, "unknown_vendor", error.message);
    }
    throw error;
  }
});
