/**
 * /api/v1/invoices — flat, line-item and progress invoicing.
 */

import { Prisma } from "@/generated/prisma/client";
import { apiError, withApiAuth } from "@/lib/api-auth";
import { createInvoiceSchema, formatZodIssues } from "@/lib/api-schemas";
import { db } from "@/lib/db";
import { createInvoice, JobNotFoundError, JobNotOpenError } from "@/lib/invoicing/service";

export const GET = withApiAuth(["invoices:read"], async (request, auth) => {
  const params = new URL(request.url).searchParams;
  const jobId = params.get("jobId");
  const status = params.get("status");

  const invoices = await db.invoice.findMany({
    where: {
      organizationId: auth.organizationId,
      ...(jobId ? { jobId } : {}),
      ...(status ? { status: status as never } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { lineItems: { orderBy: { sortOrder: "asc" } }, payments: true },
  });

  return Response.json({ data: invoices });
});

export const POST = withApiAuth(["invoices:write"], async (request, auth) => {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return apiError(400, "invalid_json", "Request body must be valid JSON.");
  }

  const parsed = createInvoiceSchema.safeParse(payload);
  if (!parsed.success) {
    return apiError(422, "validation_failed", "The invoice could not be created.", formatZodIssues(parsed.error));
  }
  const input = parsed.data;

  try {
    const invoice = await createInvoice({ organizationId: auth.organizationId, ...input });
    return Response.json({ data: invoice }, { status: 201 });
  } catch (error) {
    if (error instanceof JobNotFoundError) {
      return apiError(422, "unknown_job", error.message);
    }
    if (error instanceof JobNotOpenError) {
      return apiError(409, "job_not_open", error.message);
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return apiError(409, "duplicate_invoice_number", `Invoice "${input.invoiceNumber}" already exists.`);
    }
    if (error instanceof Error) {
      return apiError(422, "invalid_invoice", error.message);
    }
    throw error;
  }
});
