/**
 * /api/v1/jobs/{jobId}/permit-rockstar-ledger — one Permit Rockstar ledger per job
 * (private provider, flat fee / card on file, invoiced, paid, fee, invoice #/amount/dates).
 */

import { apiError, withApiAuth } from "@/lib/api-auth";
import {
  formatZodIssues,
  parseOptionalDate,
  updatePermitRockstarLedgerSchema,
} from "@/lib/api-schemas";
import { formatDateOnly } from "@/lib/date-only";
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
      invoiceNumber: parsed.data.invoiceNumber,
      invoiceAmountCents:
        parsed.data.invoiceAmountCents === undefined
          ? undefined
          : parsed.data.invoiceAmountCents,
      invoicedAt: parseOptionalDate(parsed.data.invoicedAt),
      paidAt: parseOptionalDate(parsed.data.paidAt),
    });
    return Response.json({
      data: {
        ...result,
        permitRockstar: {
          ...result.permitRockstar,
          invoicedAt: formatDateOnly(result.permitRockstar.invoicedAt),
          paidAt: formatDateOnly(result.permitRockstar.paidAt),
        },
      },
    });
  } catch (error) {
    if (error instanceof JobNotFoundError) {
      return apiError(404, "not_found", error.message);
    }
    if (
      error instanceof Error &&
      (error.message.includes("feePerInspectionCents") ||
        error.message.includes("invoiceAmountCents"))
    ) {
      return apiError(422, "validation_failed", error.message);
    }
    throw error;
  }
});
