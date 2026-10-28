/** /api/v1/notifications — list a user's notifications. */

import { apiError, withApiAuth } from "@/lib/api-auth";
import { formatZodIssues, listNotificationsQuerySchema } from "@/lib/api-schemas";
import { toCursorPage } from "@/lib/api-pagination";
import { db } from "@/lib/db";

export const GET = withApiAuth(["notifications:read"], async (request, auth) => {
  const url = new URL(request.url);
  const parsed = listNotificationsQuerySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) {
    return apiError(
      400,
      "invalid_query",
      "userId is required. Optional: unreadOnly, limit, cursor.",
      formatZodIssues(parsed.error),
    );
  }
  const { userId, unreadOnly, limit, cursor } = parsed.data;

  const notifications = await db.notification.findMany({
    where: { organizationId: auth.organizationId, userId, ...(unreadOnly ? { readAt: null } : {}) },
    orderBy: { createdAt: "desc" },
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });

  return Response.json(toCursorPage(notifications, limit));
});
