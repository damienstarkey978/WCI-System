/**
 * /api/v1/permits/{permitId} — update pulled status, vendor, or permit number; DELETE removes the permit.
 */

import { apiError, withApiAuth } from "@/lib/api-auth";
import { formatZodIssues, updatePermitSchema } from "@/lib/api-schemas";
import { db } from "@/lib/db";
import {
  assignPermitVendor,
  deleteJobPermit,
  PermitNotFoundError,
  setPermitPulled,
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
    if (parsed.data.pulled !== undefined) {
      await setPermitPulled(auth.organizationId, permitId, parsed.data.pulled);
    }
    if (parsed.data.vendorId !== undefined) {
      await assignPermitVendor(auth.organizationId, permitId, parsed.data.vendorId ?? null);
    }
    if (parsed.data.permitNumber !== undefined) {
      const existing = await db.jobPermit.findFirst({ where: { id: permitId, organizationId: auth.organizationId } });
      if (!existing) throw new PermitNotFoundError(permitId);
      await db.jobPermit.update({
        where: { id: permitId },
        data: { permitNumber: parsed.data.permitNumber },
      });
    }

    const permit = await db.jobPermit.findFirst({
      where: { id: permitId, organizationId: auth.organizationId },
      include: {
        vendor: { select: { id: true, name: true, email: true } },
        inspections: { orderBy: { sortOrder: "asc" } },
      },
    });
    if (!permit) throw new PermitNotFoundError(permitId);
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
