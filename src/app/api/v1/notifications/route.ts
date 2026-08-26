/** /api/v1/notifications — list a user's notifications. */

import { apiError, withApiAuth } from "@/lib/api-auth";
import { formatZodIssues, listNotificationsQuerySchema } from "@/lib/api-schemas";
import { db } from "@/lib/db";

export const GET = withApiAuth(["notifications:read"], async (request, auth) => {
  const url = new URL(request.url);
  const parsed = listNotificationsQuerySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) {
    return apiError(400, "invalid_query", "Invalid query parameters.", formatZodIssues(parsed.error));
  }
  const { userId, unreadOnly, limit } = parsed.data;

  const notifications = await db.notification.findMany({
    where: { organizationId: auth.organizationId, userId, ...(unreadOnly ? { readAt: null } : {}) },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  return Response.json({ data: notifications });
});
