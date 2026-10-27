import type { ReactNode } from "react";

import { SetupNotice } from "@/app/admin/setup-notice";
import { currentAppUserOrRedirect } from "@/lib/auth";

import { AppShell } from "./AppShell";
import { notificationBellDataForUser, sidebarJobsForOrg } from "./data";

/**
 * The common case for a section layout: sign the user in, load the sidebar
 * job list and notification bell feed, and wrap children in AppShell. Used
 * directly by every top-level section that has no job-scoped setup work of
 * its own (Leads, Vendors, Clients, People); jobs/[jobId]/layout.tsx still
 * does its own thing since it also has to verify the job belongs to the org.
 *
 * Pass `showJobSidebar={false}` for Sales CRM layouts (Buildertrend has no
 * left job rail on Sales — Leads, Activities, Proposals, Materials, …).
 */
export async function StaffShell({
  activeJobId,
  showJobSidebar = true,
  children,
}: {
  activeJobId?: string;
  showJobSidebar?: boolean;
  children: ReactNode;
}) {
  let user;
  try {
    user = await currentAppUserOrRedirect();
  } catch (error) {
    return <SetupNotice detail={error instanceof Error ? error.message : String(error)} />;
  }

  // Sales still needs the job list for TopNav jump targets / mobile drawer, but
  // skips rendering the left rail via showJobSidebar.
  const [jobs, bell] = await Promise.all([
    sidebarJobsForOrg(user.organizationId, user),
    notificationBellDataForUser(user.organizationId, user.id),
  ]);

  return (
    <AppShell
      jobs={jobs}
      activeJobId={activeJobId}
      notifications={bell.notifications}
      unreadCount={bell.unreadCount}
      showJobSidebar={showJobSidebar}
    >
      {children}
    </AppShell>
  );
}
