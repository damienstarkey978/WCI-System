/**
 * GET /api/v1/users — staff directory for bots that need a userId
 * (notifications, time-clock overtime summary, assignee filters).
 * Returns id / name / email / role / agentKind / isActive only — no Clerk secrets.
 */

import { apiError, withApiAuth } from "@/lib/api-auth";
import { formatZodIssues, listUsersQuerySchema } from "@/lib/api-schemas";
import { toCursorPage } from "@/lib/api-pagination";
import { db } from "@/lib/db";

export const GET = withApiAuth(["users:read"], async (request, auth) => {
  const parsed = listUsersQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) {
    return apiError(400, "invalid_query", "Invalid query parameters.", formatZodIssues(parsed.error));
  }
  const { role, isActive, limit, cursor } = parsed.data;

  const users = await db.user.findMany({
    where: {
      organizationId: auth.organizationId,
      ...(role ? { role: role as never } : {}),
      ...(isActive === undefined ? {} : { isActive }),
    },
    orderBy: [{ name: "asc" }, { email: "asc" }],
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    select: {
      id: true,
      name: true,
      email: true,
      title: true,
      role: true,
      agentKind: true,
      isActive: true,
      createdAt: true,
    },
  });

  return Response.json(toCursorPage(users, limit));
});
