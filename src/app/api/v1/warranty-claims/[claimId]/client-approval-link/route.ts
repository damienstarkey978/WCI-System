/**
 * /api/v1/warranty-claims/[claimId]/client-approval-link — issue a headless
 * link for the client to confirm they're satisfied, no login required.
 */

import { ClientActionTokenPurpose } from "@/generated/prisma/enums";
import { apiError, withApiAuth } from "@/lib/api-auth";
import { formatZodIssues, requestApprovalLinkSchema } from "@/lib/api-schemas";
import { ClientNotFoundError, issueApprovalLink } from "@/lib/client-portal/auth";
import { db } from "@/lib/db";

type Context = { params: Promise<{ claimId: string }> };

export const POST = withApiAuth<Context>(["warranty:write"], async (request, auth, context) => {
  const { claimId } = await context.params;

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return apiError(400, "invalid_json", "Request body must be valid JSON.");
  }

  const parsed = requestApprovalLinkSchema.safeParse(payload);
  if (!parsed.success) {
    return apiError(422, "validation_failed", "The approval link could not be issued.", formatZodIssues(parsed.error));
  }

  const claim = await db.warrantyClaim.findFirst({ where: { id: claimId, organizationId: auth.organizationId }, select: { id: true } });
  if (!claim) return apiError(404, "not_found", `Warranty claim ${claimId} not found`);

  try {
    const { token } = await issueApprovalLink({
      organizationId: auth.organizationId,
      clientId: parsed.data.clientId,
      purpose: ClientActionTokenPurpose.WARRANTY_CLIENT_ACCEPTANCE,
      resourceId: claimId,
    });
    return Response.json({ data: { token } }, { status: 201 });
  } catch (error) {
    if (error instanceof ClientNotFoundError) return apiError(404, "not_found", error.message);
    throw error;
  }
});
