/**
 * /api/v1/leads/[leadId]/convert-to-job — explicit conversion action
 * (CLAUDE.md 2.3: "Lead / Opportunity (pre-Job, CRM)"). Creates a real Job in
 * PRE_SALE — Estimates and Proposals can then be built against it with no
 * changes to either subsystem.
 */

import { Prisma } from "@/generated/prisma/client";
import { apiError, withApiAuth } from "@/lib/api-auth";
import { convertLeadToJobSchema, formatZodIssues } from "@/lib/api-schemas";
import { convertLeadToJob, LeadAlreadyConvertedError, LeadNotFoundError } from "@/lib/crm/service";

type Context = { params: Promise<{ leadId: string }> };

export const POST = withApiAuth<Context>(["leads:write", "jobs:write"], async (request, auth, context) => {
  const { leadId } = await context.params;

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return apiError(400, "invalid_json", "Request body must be valid JSON.");
  }

  const parsed = convertLeadToJobSchema.safeParse(payload);
  if (!parsed.success) {
    return apiError(422, "validation_failed", "The lead could not be converted.", formatZodIssues(parsed.error));
  }

  try {
    const result = await convertLeadToJob(auth.organizationId, leadId, parsed.data, auth.apiKeyId);
    return Response.json({ data: result }, { status: 201 });
  } catch (error) {
    if (error instanceof LeadNotFoundError) return apiError(404, "not_found", error.message);
    if (error instanceof LeadAlreadyConvertedError) return apiError(409, "already_converted", error.message);
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return apiError(409, "duplicate_prefix", `A job with prefix "${parsed.data.prefix}" already exists.`);
    }
    throw error;
  }
});
