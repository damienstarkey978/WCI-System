/**
 * POST /api/v1/portal/selections/[selectionId]/options/[optionId]/approve —
 * the client-facing side of approveSelectionOption(). Same dual-auth shape as
 * the Change Order approval endpoint: a portal session gated by
 * ClientJobAccess.canApproveSelections, or a single-use SELECTION_APPROVAL
 * token scoped to this exact option.
 */

import { ClientActionTokenPurpose } from "@/generated/prisma/enums";
import { apiError, extractToken } from "@/lib/api-auth";
import {
  authenticateClientSession,
  InvalidActionTokenError,
  ModuleNotVisibleError,
  NoJobAccessError,
  redeemActionToken,
  requireClientJobAccess,
} from "@/lib/client-portal/auth";
import {
  approveSelectionOption,
  JobNotOpenError,
  SelectionAlreadyDecidedError,
  SelectionNotFoundError,
  SelectionOptionNotFoundError,
} from "@/lib/selections/service";
import { db } from "@/lib/db";

type Context = { params: Promise<{ selectionId: string; optionId: string }> };

export async function POST(request: Request, context: Context) {
  const { selectionId, optionId } = await context.params;

  const selection = await db.selection.findUnique({
    where: { id: selectionId },
    select: { id: true, organizationId: true, jobId: true },
  });
  if (!selection) return apiError(404, "not_found", `Selection ${selectionId} not found`);

  try {
    const session = await authenticateClientSession(request);

    let result;
    if (session.ok) {
      if (session.context.organizationId !== selection.organizationId) {
        return apiError(404, "not_found", `Selection ${selectionId} not found`);
      }
      await requireClientJobAccess(session.context.clientId, selection.jobId, "canApproveSelections");
      result = await approveSelectionOption({ organizationId: selection.organizationId, selectionId, optionId });
    } else {
      const token = extractToken(request);
      if (!token) return apiError(401, "unauthorized", "A portal session or approval token is required.");
      result = await redeemActionToken(token, ClientActionTokenPurpose.SELECTION_APPROVAL, optionId, () =>
        approveSelectionOption({ organizationId: selection.organizationId, selectionId, optionId }),
      );
    }

    return Response.json({ data: result });
  } catch (error) {
    if (error instanceof NoJobAccessError) return apiError(404, "not_found", error.message);
    if (error instanceof ModuleNotVisibleError) return apiError(403, "forbidden", error.message);
    if (error instanceof InvalidActionTokenError) return apiError(401, "invalid_token", error.message);
    if (error instanceof SelectionNotFoundError || error instanceof SelectionOptionNotFoundError) {
      return apiError(404, "not_found", error.message);
    }
    if (error instanceof SelectionAlreadyDecidedError) return apiError(409, "already_decided", error.message);
    if (error instanceof JobNotOpenError) return apiError(409, "job_not_open", error.message);
    throw error;
  }
}
