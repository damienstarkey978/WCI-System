import { AppShell } from "@/components/shell/AppShell";
import { notificationBellDataForUser, sidebarJobsForOrg } from "@/components/shell/data";
import { markAllNotificationsReadAction, markNotificationReadAction } from "@/components/shell/notification-actions";
import { SetupNotice } from "@/app/admin/setup-notice";
import { currentAppUserOrRedirect } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { listNotificationsForUser } from "@/lib/notifications/service";

export const dynamic = "force-dynamic";

/** Mirrors src/components/shell/TopNav.tsx's client-side notificationText — this page is a server component, so it can't share that client helper directly. */
function notificationText(payload: Record<string, unknown>): string {
  if (payload.type === "comment_mention") {
    const preview = typeof payload.bodyPreview === "string" ? payload.bodyPreview : "";
    const featureType = typeof payload.featureType === "string" ? payload.featureType.replace(/_/g, " ").toLowerCase() : "an item";
    return `You were mentioned on ${featureType}: "${preview}"`;
  }
  return typeof payload.type === "string" ? payload.type.replace(/_/g, " ") : "New notification";
}

/**
 * "Notification History" (Buildertrend screenshot gap-analysis pass) — the full log
 * behind the top-nav bell, which only ever shows the 10 most recent. This is
 * Buildertrend's Messaging > Notification History item.
 */
export default async function NotificationHistoryPage() {
  let user;
  try {
    user = await currentAppUserOrRedirect();
  } catch (error) {
    return <SetupNotice detail={error instanceof Error ? error.message : String(error)} />;
  }

  const [jobs, bell, notifications] = await Promise.all([
    sidebarJobsForOrg(user.organizationId, user),
    notificationBellDataForUser(user.organizationId, user.id),
    listNotificationsForUser(user.organizationId, user.id, 200),
  ]);

  return (
    <AppShell jobs={jobs} notifications={bell.notifications} unreadCount={bell.unreadCount}>
      <div className="mx-auto flex max-w-3xl flex-col gap-4 p-6">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold text-[var(--bt-text)]">Notification History</h1>
          {bell.unreadCount > 0 ? (
            <form action={markAllNotificationsReadAction}>
              <button type="submit" className="text-sm font-medium text-[var(--bt-primary)] hover:underline">
                Mark all as read
              </button>
            </form>
          ) : null}
        </div>

        {notifications.length === 0 ? (
          <p className="text-sm text-[var(--bt-muted)]">No notifications yet.</p>
        ) : (
          <div className="overflow-hidden rounded-lg border bg-[var(--bt-panel-bg)]" style={{ borderColor: "var(--bt-border)" }}>
            <ul className="divide-y" style={{ borderColor: "var(--bt-border)" }}>
              {notifications.map((notification) => {
                const payload = notification.payload as Record<string, unknown>;
                const isUnread = notification.readAt === null;
                return (
                  <li key={notification.id} className="flex items-start justify-between gap-3 px-4 py-3 text-sm" style={{ background: isUnread ? "var(--bt-status-open-bg)" : undefined }}>
                    <div>
                      <p className="text-[var(--bt-text)]" style={isUnread ? { fontWeight: 600 } : undefined}>
                        {notificationText(payload)}
                      </p>
                      <p className="mt-0.5 text-xs text-[var(--bt-muted)]">
                        {notification.channel} · {formatDate(notification.createdAt)}
                      </p>
                    </div>
                    {isUnread ? (
                      <form action={markNotificationReadAction}>
                        <input type="hidden" name="notificationId" value={notification.id} />
                        <button type="submit" className="shrink-0 text-xs font-medium text-[var(--bt-primary)] hover:underline">
                          Mark read
                        </button>
                      </form>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>
    </AppShell>
  );
}
