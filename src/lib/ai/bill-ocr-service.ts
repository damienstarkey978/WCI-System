/**
 * Database wiring for AI bill OCR. Keeps src/lib/ai/bill-ocr-assistant.ts free of
 * Prisma so its Claude-calling logic stays unit-testable with a fake client — same
 * split as src/lib/ai/service.ts for estimate drafting.
 */

import { db } from "@/lib/db";
import { createBill } from "@/lib/bills/service";
import { extractBillFromDocument, type BillOcrDocumentInput } from "@/lib/ai/bill-ocr-assistant";
import type { CostCodeOption } from "@/lib/ai/bill-ocr-draft";

export class JobNotFoundError extends Error {
  constructor(jobId: string) {
    super(`Job ${jobId} not found`);
    this.name = "JobNotFoundError";
  }
}

export class NoCostCodesError extends Error {
  constructor() {
    super("This organization has no active cost codes to extract against. Seed the catalog first.");
    this.name = "NoCostCodesError";
  }
}

export interface CreateBillFromOcrInput {
  readonly organizationId: string;
  readonly jobId: string;
  readonly document: BillOcrDocumentInput;
  readonly vendorId?: string | null;
}

export interface CreateBillFromOcrResult {
  readonly bill: Awaited<ReturnType<typeof createBill>>;
  readonly assumptions: readonly string[];
}

/**
 * Extract a receipt/bill and persist it as a real Bill — `fromOcr: true`, and
 * whatever `approvalStatus` a normal bill starts at (`IN_REVIEW`), so it enters the
 * exact same human-approval workflow as one entered by hand.
 */
export async function createBillFromOcr(input: CreateBillFromOcrInput): Promise<CreateBillFromOcrResult> {
  const job = await db.job.findFirst({
    where: { id: input.jobId, organizationId: input.organizationId },
    select: { id: true },
  });
  if (!job) {
    throw new JobNotFoundError(input.jobId);
  }

  const costCodeRows = await db.costCode.findMany({
    where: { organizationId: input.organizationId, isActive: true },
    select: { id: true, code: true, name: true, defaultCostType: true },
  });
  if (costCodeRows.length === 0) {
    throw new NoCostCodesError();
  }
  const costCodes: readonly CostCodeOption[] = costCodeRows;

  const extraction = await extractBillFromDocument({ document: input.document, costCodes });

  const bill = await createBill({
    organizationId: input.organizationId,
    jobId: input.jobId,
    vendorName: extraction.vendorName,
    vendorId: input.vendorId ?? null,
    billNumber: extraction.billNumber,
    issuedOn: extraction.issuedOn,
    fromOcr: true,
    lineItems: extraction.lineItems,
  });

  return { bill, assumptions: extraction.assumptions };
}
