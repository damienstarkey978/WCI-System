/**
 * GET  /api/v1/admin/heather-test-purge — preview Heather Oct 28 test leftovers
 * POST /api/v1/admin/heather-test-purge — apply purge + client name repair
 *
 * Narrow pattern match only (test company / brandon sub test / TEST-INV-* /
 * Phillips "Testing" logs / TEST Jarvis proposals / Test Receipt emails +
 * job-style client names). Body must include `{ "confirm": true }` to apply.
 */

import { applyHeatherTestPurge, previewHeatherTestPurge } from "@/lib/admin/heather-test-purge";
import { apiError, withApiAuth } from "@/lib/api-auth";
import { formatZodIssues, heatherTestPurgeSchema } from "@/lib/api-schemas";

const PURGE_SCOPES = [
  "clients:write",
  "vendors:write",
  "invoices:write",
  "daily-logs:write",
  "proposals:write",
] as const;

export const GET = withApiAuth([...PURGE_SCOPES], async (_request, auth) => {
  const preview = await previewHeatherTestPurge(auth.organizationId);
  return Response.json({ data: preview });
});

export const POST = withApiAuth([...PURGE_SCOPES], async (request, auth) => {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return apiError(400, "invalid_json", "Request body must be valid JSON.");
  }

  const parsed = heatherTestPurgeSchema.safeParse(payload);
  if (!parsed.success) {
    return apiError(
      422,
      "validation_failed",
      'Pass { "confirm": true } to apply the Heather test purge. Use GET for a dry-run preview.',
      formatZodIssues(parsed.error),
    );
  }

  const result = await applyHeatherTestPurge(auth.organizationId);
  return Response.json({
    data: {
      deletedVendors: result.deletedVendors,
      deletedInvoices: result.deletedInvoices,
      deletedDailyLogs: result.deletedDailyLogs,
      deletedProposals: result.deletedProposals,
      deletedInboundEmails: result.deletedInboundEmails,
      repairedClientNames: result.repairedClientNames,
      skipped: result.skipped,
      preview: result.preview,
    },
  });
});
