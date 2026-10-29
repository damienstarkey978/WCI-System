/** /api/v1/clients — create/list Client Portal contacts. */

import { apiError, withApiAuth } from "@/lib/api-auth";
import { createClientSchema, formatZodIssues, listClientsQuerySchema } from "@/lib/api-schemas";
import { toCursorPage } from "@/lib/api-pagination";
import { createClient } from "@/lib/client-portal/service";
import { db } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";

export const GET = withApiAuth(["clients:read"], async (request, auth) => {
  const parsed = listClientsQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) {
    return apiError(400, "invalid_query", "Invalid query parameters.", formatZodIssues(parsed.error));
  }
  const { jobId, limit, cursor } = parsed.data;

  const clients = await db.client.findMany({
    where: {
      organizationId: auth.organizationId,
      ...(jobId ? { jobAccess: { some: { jobId } } } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    include: { jobAccess: true },
  });

  return Response.json(toCursorPage(clients, limit));
});

export const POST = withApiAuth(["clients:write"], async (request, auth) => {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return apiError(400, "invalid_json", "Request body must be valid JSON.");
  }

  const parsed = createClientSchema.safeParse(payload);
  if (!parsed.success) {
    return apiError(422, "validation_failed", "The client could not be created.", formatZodIssues(parsed.error));
  }

  try {
    const client = await createClient({ organizationId: auth.organizationId, ...parsed.data });
    return Response.json({ data: client }, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return apiError(409, "duplicate_email", "A client with this email already exists.");
    }
    throw error;
  }
});
