import { apiError, withApiAuth } from "@/lib/api-auth";
import { markNotificationRead, NotificationNotFoundError } from "@/lib/notifications/service";

type Context = { params: Promise<{ notificationId: string }> };

export const POST = withApiAuth<Context>(["notifications:write"], async (_request, auth, context) => {
  const { notificationId } = await context.params;

  try {
    const notification = await markNotificationRead(auth.organizationId, notificationId);
    return Response.json({ data: notification });
  } catch (error) {
    if (error instanceof NotificationNotFoundError) {
      return apiError(404, "not_found", error.message);
    }
    throw error;
  }
});
