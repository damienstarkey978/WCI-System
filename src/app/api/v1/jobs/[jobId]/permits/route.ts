/**
 * /api/v1/jobs/{jobId}/permits — list (GET) or create one trade permit (POST).
 * Creating a permit seeds typical inspections for that trade (editable afterward).
 * ensure-defaults remains for bots that want Building+MEP shells in one shot.
 */

import { apiError, withApiAuth } from "@/lib/api-auth";
import { createJobPermitSchema, formatZodIssues } from "@/lib/api-schemas";
import { db } from "@/lib/db";
import { parseOptionalDate } from "@/lib/api-schemas";
import { createJobPermit, JobNotFoundError } from "@/lib/permitting/service";

type Context = { params: Promise<{ jobId: string }> };

export const GET = withApiAuth<Context>(["permits:read"], async (_request, auth, context) => {
  const { jobId } = await context.params;

  const job = await db.job.findFirst({
    where: { id: jobId, organizationId: auth.organizationId },
    select: {
      id: true,
      name: true,
      permitNumber: true,
      nocOnFile: true,
      ntboFiled: true,
      buildingPermitDocsCreatedAt: true,
    },
  });
  if (!job) {
    return apiError(404, "not_found", `No job ${jobId} in this organization.`);
  }

  const permits = await db.jobPermit.findMany({
    where: { jobId, organizationId: auth.organizationId },
    orderBy: { trade: "asc" },
    include: {
      vendor: { select: { id: true, name: true, email: true } },
      inspections: { orderBy: { sortOrder: "asc" } },
    },
  });

  // `data` stays the permit array for backward compatibility with Heather/MCP.
  // Job flags ride along so bots can validate without a second call.
  return Response.json({
    data: permits,
    job: {
      id: job.id,
      name: job.name,
      permitNumber: job.permitNumber,
      nocOnFile: job.nocOnFile,
      ntboFiled: job.ntboFiled,
      buildingPermitDocsCreatedAt: job.buildingPermitDocsCreatedAt,
    },
  });
});

export const POST = withApiAuth<Context>(["permits:write"], async (request, auth, context) => {
  const { jobId } = await context.params;

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return apiError(400, "invalid_json", "Request body must be valid JSON.");
  }

  const parsed = createJobPermitSchema.safeParse(payload);
  if (!parsed.success) {
    return apiError(422, "validation_failed", "The permit could not be created.", formatZodIssues(parsed.error));
  }

  try {
    const permit = await createJobPermit(auth.organizationId, jobId, parsed.data.trade, {
      permitNumber: parsed.data.permitNumber,
      vendorId: parsed.data.vendorId,
      label: parsed.data.label,
      status: parsed.data.status,
      issuedAt: parseOptionalDate(parsed.data.issuedAt),
      expiresAt: parseOptionalDate(parsed.data.expiresAt),
      jurisdiction: parsed.data.jurisdiction,
      contractorName: parsed.data.contractorName,
      seedDefaultInspections: parsed.data.seedDefaultInspections,
    });
    return Response.json({ data: permit }, { status: 201 });
  } catch (error) {
    if (error instanceof JobNotFoundError) {
      return apiError(404, "not_found", `No job ${jobId} in this organization.`);
    }
    if (error instanceof Error && error.message === "Vendor not found.") {
      return apiError(422, "unknown_vendor", error.message);
    }
    throw error;
  }
});
