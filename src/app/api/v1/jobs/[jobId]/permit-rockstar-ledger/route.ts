/**
 * /api/v1/jobs/{jobId}/permit-rockstar-ledger — one Permit Rockstar ledger per job
 * (private provider, flat fee / card on file, invoiced, paid, fee per inspection).
 */

import { apiError, withApiAuth } from "@/lib/api-auth";
import { formatZodIssues, updatePermitRockstarLedgerSchema } from "@/lib/api-schemas";
import {
  JobNotFoundError,
  updatePermitRockstarLedger,
} from "@/lib/permitting/service";

type Context = { params: Promise<{ jobId: string }> };

export const PATCH = withApiAuth<Context>(["permits:write"], async (request, auth, context) => {
  const { jobId } = await context.params;

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return apiError(400, "invalid_json", "Request body must be valid JSON.");
  }

  const parsed = updatePermitRockstarLedgerSchema.safeParse(payload);
  if (!parsed.success) {
    return apiError(
      422,
      "validation_failed",
      "Permit Rockstar ledger could not be updated.",
      formatZodIssues(parsed.error),
    );
  }

  try {
    const result = await updatePermitRockstarLedger(auth.organizationId, jobId, {
      privateProvider: parsed.data.privateProvider,
      setupType: parsed.data.setupType === undefined ? undefined : parsed.data.setupType,
      invoiced: parsed.data.invoiced,
      paid: parsed.data.paid,
      feePerInspectionCents:
        parsed.data.feePerInspectionCents === undefined
          ? undefined
          : parsed.data.feePerInspectionCents,
    });
    return Response.json({ data: result });
  } catch (error) {
    if (error instanceof JobNotFoundError) {
      return apiError(404, "not_found", error.message);
    }
    if (error instanceof Error && error.message.includes("feePerInspectionCents")) {
      return apiError(422, "validation_failed", error.message);
    }
    throw error;
  }
});
