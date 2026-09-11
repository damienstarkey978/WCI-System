/**
 * /api/v1/invoices — flat, line-item and progress invoicing.
 */

import { Prisma } from "@/generated/prisma/client";
import { apiError, withApiAuth } from "@/lib/api-auth";
import { createInvoiceSchema, formatZodIssues, listInvoicesQuerySchema } from "@/lib/api-schemas";
import { db } from "@/lib/db";
import { createInvoice, JobNotFoundError, JobNotOpenError } from "@/lib/invoicing/service";

export const GET = withApiAuth(["invoices:read"], async (request, auth) => {
  const url = new URL(request.url);
  const parsed = listInvoicesQuerySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) {
    return apiError(400, "invalid_query", "Invalid query parameters.", formatZodIssues(parsed.error));
  }
  const { jobId, status, limit, cursor } = parsed.data;

  const invoices = await db.invoice.findMany({
    where: {
      organizationId: auth.organizationId,
      ...(jobId ? { jobId } : {}),
      ...(status ? { status } : {}),
    },
    orderBy: { createdAt: "desc" },
    // One more than asked for, so hasMore is known without a second count query.
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    include: { lineItems: { orderBy: { sortOrder: "asc" } }, payments: true },
  });

  const hasMore = invoices.length > limit;
  const page = hasMore ? invoices.slice(0, limit) : invoices;

  return Response.json({
    data: page,
    pagination: { nextCursor: hasMore ? page[page.length - 1].id : null, hasMore },
  });
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
