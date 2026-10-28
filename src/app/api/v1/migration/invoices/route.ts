/**
 * POST /api/v1/migration/invoices — bulk-import historical client Invoices from
 * Buildertrend, already PAID/PARTIALLY_PAID, with the Payment rows that document
 * how they got there. See src/lib/migration/service.ts for the full rationale.
 *
 * Idempotent on (organizationId, invoiceNumber).
 */

import { apiError, withApiAuth } from "@/lib/api-auth";
import { formatZodIssues, importInvoicesSchema } from "@/lib/api-schemas";
import { importInvoice } from "@/lib/migration/service";

export const POST = withApiAuth(["migration:write"], async (request, auth) => {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return apiError(400, "invalid_json", "Request body must be valid JSON.");
  }

  const parsed = importInvoicesSchema.safeParse(payload);
  if (!parsed.success) {
    return apiError(422, "validation_failed", "Could not import invoices.", formatZodIssues(parsed.error));
  }

  // Sequential — see src/app/api/v1/migration/daily-logs/route.ts for why.
  const results: Array<{
    index: number;
    status: "success" | "already_exists" | "error";
    invoiceId?: string;
    amountCents?: number;
    error?: string;
  }> = [];
  for (const [index, input] of parsed.data.invoices.entries()) {
    try {
      const { record, created } = await importInvoice({ organizationId: auth.organizationId, ...input });
      results.push({
        index,
        status: created ? "success" : "already_exists",
        invoiceId: record.id,
        amountCents: record.amountCents,
      });
    } catch (error) {
      results.push({ index, status: "error", error: error instanceof Error ? error.message : "Unknown error" });
    }
  }

  return Response.json({ data: results });
});
