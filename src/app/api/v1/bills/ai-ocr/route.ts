/**
 * /api/v1/bills/ai-ocr — draft a Bill from a photographed/scanned receipt or vendor
 * invoice.
 *
 * Same scope as hand-entering one (`bills:write`) — this is another way to create a
 * Bill, not a different capability, exactly like /estimates/ai-draft is scoped under
 * estimates:write. The created Bill starts `fromOcr: true` and the normal `IN_REVIEW`
 * default, so it goes through the same human approval as any other bill.
 */

import { apiError, withApiAuth } from "@/lib/api-auth";
import { aiOcrBillSchema, formatZodIssues } from "@/lib/api-schemas";
import { AiNotConfiguredError, OcrExtractionError } from "@/lib/ai/bill-ocr-assistant";
import { createBillFromOcr, JobNotFoundError, NoCostCodesError } from "@/lib/ai/bill-ocr-service";
import { JobNotOpenError, UnknownCostCodeError, UnknownVendorError } from "@/lib/bills/service";

export const POST = withApiAuth(["bills:write"], async (request, auth) => {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return apiError(400, "invalid_json", "Request body must be valid JSON.");
  }

  const parsed = aiOcrBillSchema.safeParse(payload);
  if (!parsed.success) {
    return apiError(422, "validation_failed", "Invalid OCR request.", formatZodIssues(parsed.error));
  }

  try {
    const result = await createBillFromOcr({
      organizationId: auth.organizationId,
      jobId: parsed.data.jobId,
      vendorId: parsed.data.vendorId,
      document: parsed.data.document,
    });
    return Response.json({ data: { bill: result.bill, assumptions: result.assumptions } }, { status: 201 });
  } catch (error) {
    if (error instanceof JobNotFoundError) return apiError(422, "unknown_job", error.message);
    if (error instanceof NoCostCodesError) return apiError(422, "no_cost_codes", error.message);
    if (error instanceof AiNotConfiguredError) return apiError(503, "ai_not_configured", error.message);
    if (error instanceof OcrExtractionError) return apiError(502, "ocr_extraction_failed", error.message);
    if (error instanceof JobNotOpenError) return apiError(409, "job_not_open", error.message);
    if (error instanceof UnknownVendorError) return apiError(422, "unknown_vendor", error.message);
    if (error instanceof UnknownCostCodeError) return apiError(422, "unknown_cost_code", error.message, { unknown: error.unknownIds });
    throw error;
  }
});
