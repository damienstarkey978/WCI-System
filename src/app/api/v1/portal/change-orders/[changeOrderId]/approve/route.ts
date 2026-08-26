/**
 * POST /api/v1/portal/change-orders/[changeOrderId]/approve — the client-facing
 * side of approveChangeOrder(). Accepts either a portal session (logged-in
 * client, gated by ClientJobAccess.canApproveChangeOrders) or a single-use
 * CHANGE_ORDER_APPROVAL token scoped to this exact change order (the headless,
 * no-login-required path — CLAUDE.md 2.3). Both travel as the Authorization
 * header; see the comment on portalApproveChangeOrderSchema.
 */

import { ClientActionTokenPurpose } from "@/generated/prisma/enums";
import { apiError, extractToken } from "@/lib/api-auth";
import { formatZodIssues, portalApproveChangeOrderSchema } from "@/lib/api-schemas";
import {
  authenticateClientSession,
  InvalidActionTokenError,
  ModuleNotVisibleError,
  NoJobAccessError,
  redeemActionToken,
  requireClientJobAccess,
} from "@/lib/client-portal/auth";
import {
  approveChangeOrder,
  ChangeOrderNotFoundError,
  ChangeOrderNotPendingError,
  EmptyChangeOrderError,
  IncompleteFlatChangeOrderError,
} from "@/lib/change-orders/service";
import { db } from "@/lib/db";

type Context = { params: Promise<{ changeOrderId: string }> };

function clientIp(request: Request): string | undefined {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? undefined;
}

async function runApproval(
  organizationId: string,
  changeOrderId: string,
  clientId: string,
  overrideName: string | undefined,
  signatureIp: string | undefined,
) {
  const client = await db.client.findUnique({ where: { id: clientId }, select: { name: true } });
  return approveChangeOrder({
    organizationId,
    changeOrderId,
    clientSignatureName: overrideName ?? client?.name,
    clientSignatureIp: signatureIp,
  });
}

export async function POST(request: Request, context: Context) {
  const { changeOrderId } = await context.params;

  let payload: unknown = {};
  const rawBody = await request.text();
  if (rawBody.length > 0) {
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return apiError(400, "invalid_json", "Request body must be valid JSON.");
    }
  }
  const parsed = portalApproveChangeOrderSchema.safeParse(payload);
  if (!parsed.success) {
    return apiError(422, "validation_failed", "The change order could not be approved.", formatZodIssues(parsed.error));
  }

  const changeOrder = await db.changeOrder.findUnique({
    where: { id: changeOrderId },
    select: { id: true, organizationId: true, jobId: true },
  });
  if (!changeOrder) return apiError(404, "not_found", `Change order ${changeOrderId} not found`);

  try {
    const session = await authenticateClientSession(request);

    let result;
    if (session.ok) {
      if (session.context.organizationId !== changeOrder.organizationId) {
        return apiError(404, "not_found", `Change order ${changeOrderId} not found`);
      }
      await requireClientJobAccess(session.context.clientId, changeOrder.jobId, "canApproveChangeOrders");
      result = await runApproval(
        changeOrder.organizationId,
        changeOrderId,
        session.context.clientId,
        parsed.data.clientSignatureName,
        clientIp(request),
      );
    } else {
      const token = extractToken(request);
      if (!token) return apiError(401, "unauthorized", "A portal session or approval token is required.");
      result = await redeemActionToken(token, ClientActionTokenPurpose.CHANGE_ORDER_APPROVAL, changeOrderId, (clientId) =>
        runApproval(changeOrder.organizationId, changeOrderId, clientId, parsed.data.clientSignatureName, clientIp(request)),
      );
    }

    return Response.json({ data: result.changeOrder });
  } catch (error) {
    if (error instanceof NoJobAccessError) return apiError(404, "not_found", error.message);
    if (error instanceof ModuleNotVisibleError) return apiError(403, "forbidden", error.message);
    if (error instanceof InvalidActionTokenError) return apiError(401, "invalid_token", error.message);
    if (error instanceof ChangeOrderNotFoundError) return apiError(404, "not_found", error.message);
    if (error instanceof ChangeOrderNotPendingError) return apiError(409, "not_pending", error.message);
    if (error instanceof IncompleteFlatChangeOrderError || error instanceof EmptyChangeOrderError) {
      return apiError(422, "incomplete_change_order", error.message);
    }
    throw error;
  }
}
