import { SetupNotice } from "@/app/admin/setup-notice";
import { AppShell } from "@/components/shell/AppShell";
import { notificationBellDataForUser, sidebarJobsForOrg } from "@/components/shell/data";
import { UserRole } from "@/generated/prisma/enums";
import { requireRole } from "@/lib/auth";

import { NewJobPicker } from "./new-job-picker";

export const dynamic = "force-dynamic";

/** Buildertrend's "+ Job" entry point — the "How would you like to set up your new job?" picker. */
export default async function NewJobPage() {
  let user;
  try {
    user = await requireRole(UserRole.ADMIN, UserRole.PM);
  } catch (error) {
    return <SetupNotice detail={error instanceof Error ? error.message : String(error)} />;
  }

  const [jobs, bell] = await Promise.all([
    sidebarJobsForOrg(user.organizationId, user),
    notificationBellDataForUser(user.organizationId, user.id),
  ]);

  return (
    <AppShell jobs={jobs} notifications={bell.notifications} unreadCount={bell.unreadCount}>
      <div className="mx-auto max-w-3xl p-6">
        <NewJobPicker />
      </div>
    </AppShell>
  );
}
