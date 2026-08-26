/**
 * /api/v1/change-orders/[changeOrderId]/approval-link — issue a single-use
 * headless approval link for a client (CLAUDE.md 2.3: "a client approving a
 * Change Order via a signed link in an email, with no login required").
 */

import { ClientActionTokenPurpose } from "@/generated/prisma/enums";
import { apiError, withApiAuth } from "@/lib/api-auth";
import { formatZodIssues, requestApprovalLinkSchema } from "@/lib/api-schemas";
import { ClientNotFoundError, issueApprovalLink } from "@/lib/client-portal/auth";
import { db } from "@/lib/db";

type Context = { params: Promise<{ changeOrderId: string }> };

export const POST = withApiAuth<Context>(["change-orders:write"], async (request, auth, context) => {
  const { changeOrderId } = await context.params;

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

  const changeOrder = await db.changeOrder.findFirst({
    where: { id: changeOrderId, organizationId: auth.organizationId },
    select: { id: true },
  });
  if (!changeOrder) return apiError(404, "not_found", `Change order ${changeOrderId} not found`);

  try {
    const { token } = await issueApprovalLink({
      organizationId: auth.organizationId,
      clientId: parsed.data.clientId,
      purpose: ClientActionTokenPurpose.CHANGE_ORDER_APPROVAL,
      resourceId: changeOrderId,
    });
    return Response.json({ data: { token } }, { status: 201 });
  } catch (error) {
    if (error instanceof ClientNotFoundError) return apiError(404, "not_found", error.message);
    throw error;
  }
});
