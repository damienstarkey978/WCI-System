/**
 * GET/POST /api/v1/vendor-portal/jobs/[jobId]/bills — this vendor's own bills on
 * the job (CLAUDE.md 3: "bill/lien-waiver visibility+payment receipt" —
 * payment receipt itself is a Payment/QBO concern not built yet, so GET is
 * visibility only). POST is the vendor-facing "upload an invoice" entry point:
 * it runs the same AI OCR pipeline as the staff-facing /bills/ai-ocr route
 * (src/lib/ai/bill-ocr-service.ts) so a vendor never has to know this
 * organization's cost code catalog — the extraction assigns cost codes the
 * same way a staff-drafted OCR bill does. The created Bill starts fromOcr:
 * true and IN_REVIEW, so it lands in the job's Budget through the exact
 * same approval path as any other bill (CLAUDE.md 2.3's explicit
 * conversion-action pattern), with vendorId pinned to the authenticated
 * vendor so it can't be submitted on another vendor's behalf.
 */

import { formatZodIssues, portalUploadBillSchema } from "@/lib/api-schemas";
import { AiNotConfiguredError, OcrExtractionError } from "@/lib/ai/bill-ocr-assistant";
import { createBillFromOcr, JobNotFoundError, NoCostCodesError } from "@/lib/ai/bill-ocr-service";
import { JobNotOpenError, UnknownCostCodeError } from "@/lib/bills/service";
import { authenticatePortalJobRequest, portalAuthErrorResponse } from "@/lib/vendor-portal/auth";
import { db } from "@/lib/db";

type Context = { params: Promise<{ jobId: string }> };

export async function GET(request: Request, context: Context) {
  const { jobId } = await context.params;

  try {
    const vendor = await authenticatePortalJobRequest(request, jobId, "canViewBills");

    const bills = await db.bill.findMany({
      where: { organizationId: vendor.organizationId, jobId, vendorId: vendor.vendorId },
      orderBy: { createdAt: "desc" },
      take: 200,
      include: { lineItems: { orderBy: { sortOrder: "asc" } } },
    });

    return Response.json({ data: bills });
  } catch (error) {
    const response = portalAuthErrorResponse(error);
    if (response) return response;
    throw error;
  }
}

export async function POST(request: Request, context: Context) {
  const { jobId } = await context.params;

  try {
    const vendor = await authenticatePortalJobRequest(request, jobId, "canViewBills");

    let payload: unknown;
    try {
      payload = await request.json();
    } catch {
      return Response.json({ error: { code: "invalid_json", message: "Request body must be valid JSON." } }, { status: 400 });
    }

    const parsed = portalUploadBillSchema.safeParse(payload);
    if (!parsed.success) {
      return Response.json(
        { error: { code: "validation_failed", message: "The invoice could not be uploaded.", details: formatZodIssues(parsed.error) } },
        { status: 422 },
      );
    }

    const result = await createBillFromOcr({
      organizationId: vendor.organizationId,
      jobId,
      vendorId: vendor.vendorId,
      document: parsed.data.document,
    });

    return Response.json({ data: { bill: result.bill, assumptions: result.assumptions } }, { status: 201 });
  } catch (error) {
    const response = portalAuthErrorResponse(error);
    if (response) return response;
    if (error instanceof JobNotFoundError) return Response.json({ error: { code: "unknown_job", message: error.message } }, { status: 422 });
    if (error instanceof JobNotOpenError) return Response.json({ error: { code: "job_not_open", message: error.message } }, { status: 409 });
    if (error instanceof NoCostCodesError) return Response.json({ error: { code: "no_cost_codes", message: error.message } }, { status: 422 });
    if (error instanceof AiNotConfiguredError) return Response.json({ error: { code: "ai_not_configured", message: error.message } }, { status: 503 });
    if (error instanceof OcrExtractionError) return Response.json({ error: { code: "ocr_extraction_failed", message: error.message } }, { status: 502 });
    if (error instanceof UnknownCostCodeError) {
      return Response.json({ error: { code: "unknown_cost_code", message: error.message, unknown: error.unknownIds } }, { status: 422 });
    }
    throw error;
  }
}
