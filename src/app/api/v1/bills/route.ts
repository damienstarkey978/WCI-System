/**
 * /api/v1/bills — the other half of Duke's surface.
 *
 * A bill raised against a PO carries `purchaseOrderId`, which is what makes
 * PO-to-bill reconciliation (and the poSuffix workflow) possible.
 */

import { apiError, withApiAuth } from "@/lib/api-auth";
import { createBillSchema, formatZodIssues } from "@/lib/api-schemas";
import { db } from "@/lib/db";
import { acceptsNewCommitments } from "@/lib/job-status";
import { emitEvent } from "@/lib/webhooks";

export const GET = withApiAuth(["bills:read"], async (request, auth) => {
  const params = new URL(request.url).searchParams;
  const jobId = params.get("jobId");
  const approvalStatus = params.get("approvalStatus");

  const bills = await db.bill.findMany({
    where: {
      organizationId: auth.organizationId,
      ...(jobId ? { jobId } : {}),
      ...(approvalStatus ? { approvalStatus: approvalStatus as never } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { lineItems: { orderBy: { sortOrder: "asc" } } },
  });

  return Response.json({ data: bills });
});

export const POST = withApiAuth(["bills:write"], async (request, auth) => {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return apiError(400, "invalid_json", "Request body must be valid JSON.");
  }

  const parsed = createBillSchema.safeParse(payload);
  if (!parsed.success) {
    return apiError(422, "validation_failed", "The bill could not be created.", formatZodIssues(parsed.error));
  }
  const input = parsed.data;

  const job = await db.job.findFirst({
    where: { id: input.jobId, organizationId: auth.organizationId },
    select: { id: true, status: true },
  });
  if (!job) {
    return apiError(422, "unknown_job", `No job ${input.jobId} in this organization.`);
  }
  if (!acceptsNewCommitments(job.status)) {
    return apiError(409, "job_not_open", `Job ${input.jobId} is ${job.status} and cannot take new bills.`);
  }

  if (input.purchaseOrderId) {
    const po = await db.purchaseOrder.findFirst({
      where: { id: input.purchaseOrderId, organizationId: auth.organizationId },
      select: { id: true, jobId: true },
    });
    if (!po) {
      return apiError(422, "unknown_purchase_order", `No purchase order ${input.purchaseOrderId}.`);
    }
    // A bill billed against a PO on a different job would corrupt both budgets.
    if (po.jobId !== input.jobId) {
      return apiError(422, "po_job_mismatch", "That purchase order belongs to a different job.");
    }
  }

  const costCodeIds = [...new Set(input.lineItems.map((item) => item.costCodeId))];
  const known = await db.costCode.findMany({
    where: { id: { in: costCodeIds }, organizationId: auth.organizationId },
    select: { id: true, defaultCostType: true },
  });
  if (known.length !== costCodeIds.length) {
    const knownIds = new Set(known.map((code) => code.id));
    return apiError(422, "unknown_cost_code", "One or more cost codes are not in this organization.", {
      unknown: costCodeIds.filter((id) => !knownIds.has(id)),
    });
  }
  const defaultCostTypeById = new Map(known.map((code) => [code.id, code.defaultCostType]));

  const bill = await db.bill.create({
    data: {
      organizationId: auth.organizationId,
      jobId: input.jobId,
      purchaseOrderId: input.purchaseOrderId ?? null,
      vendorName: input.vendorName,
      billNumber: input.billNumber ?? null,
      issuedOn: input.issuedOn ?? null,
      dueOn: input.dueOn ?? null,
      fromOcr: input.fromOcr ?? false,
      lineItems: {
        create: input.lineItems.map((item, index) => ({
          costCodeId: item.costCodeId,
          costType: item.costType ?? defaultCostTypeById.get(item.costCodeId) ?? "NONE",
          title: item.title,
          amountCents: item.amountCents,
          sortOrder: index,
        })),
      },
    },
    include: { lineItems: { orderBy: { sortOrder: "asc" } } },
  });

  const totalCents = bill.lineItems.reduce((total, item) => total + item.amountCents, 0);

  await emitEvent(auth.organizationId, "bill.created", {
    billId: bill.id,
    jobId: bill.jobId,
    purchaseOrderId: bill.purchaseOrderId,
    vendorName: bill.vendorName,
    approvalStatus: bill.approvalStatus,
    totalCents,
  });

  return Response.json({ data: { ...bill, totalCents } }, { status: 201 });
});
