/**
 * POST /api/v1/migration/invoices — bulk-import historical client Invoices from
 * Buildertrend, already PAID/PARTIALLY_PAID, with the Payment rows that document
 * how they got there. See src/lib/migration/service.ts for the full rationale.
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
  const results: Array<{ index: number; status: "success" | "error"; invoiceId?: string; amountCents?: number; error?: string }> = [];
  for (const [index, input] of parsed.data.invoices.entries()) {
    try {
      const invoice = await importInvoice({ organizationId: auth.organizationId, ...input });
      results.push({ index, status: "success", invoiceId: invoice.id, amountCents: invoice.amountCents });
    } catch (error) {
      results.push({ index, status: "error", error: error instanceof Error ? error.message : "Unknown error" });
    }
  }

  return Response.json({ data: results });
});
