/**
 * /api/v1/selections/[selectionId]/options/[optionId]/approval-link — issue a
 * single-use headless approval link scoped to exactly this option. Approving
 * it settles the whole Selection (its siblings are marked DECLINED), so a
 * link is issued per option, not per selection.
 */

import { ClientActionTokenPurpose } from "@/generated/prisma/enums";
import { apiError, withApiAuth } from "@/lib/api-auth";
import { formatZodIssues, requestApprovalLinkSchema } from "@/lib/api-schemas";
import { ClientNotFoundError, issueApprovalLink } from "@/lib/client-portal/auth";
import { db } from "@/lib/db";

type Context = { params: Promise<{ selectionId: string; optionId: string }> };

export const POST = withApiAuth<Context>(["selections:write"], async (request, auth, context) => {
  const { selectionId, optionId } = await context.params;

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

  const option = await db.selectionOption.findFirst({
    where: { id: optionId, selectionId, selection: { organizationId: auth.organizationId } },
    select: { id: true },
  });
  if (!option) return apiError(404, "not_found", `Selection option ${optionId} not found`);

  try {
    const { token } = await issueApprovalLink({
      organizationId: auth.organizationId,
      clientId: parsed.data.clientId,
      purpose: ClientActionTokenPurpose.SELECTION_APPROVAL,
      resourceId: optionId,
    });
    return Response.json({ data: { token } }, { status: 201 });
  } catch (error) {
    if (error instanceof ClientNotFoundError) return apiError(404, "not_found", error.message);
    throw error;
  }
});
