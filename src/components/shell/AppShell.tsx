import type { ReactNode } from "react";

import { JarvisLauncher } from "@/components/jarvis/JarvisLauncher";
import { UserRole } from "@/generated/prisma/enums";
import { currentAppUser } from "@/lib/auth";
import { isAnthropicConfigured, isClerkConfigured } from "@/lib/env";
import { isJarvisUiEnabled } from "@/lib/feature-flags";
import { ROLE_DESCRIPTIONS } from "@/lib/staff/role-descriptions";

import { sidebarTemplateJobsForOrg } from "./data";
import { JobSidebar, type SidebarJob } from "./JobSidebar";
import { TopNav, type BellNotification } from "./TopNav";

/**
 * The Buildertrend-match staff shell: top nav + left job sidebar + content slot.
 * Server component — TopNav is itself a client component for its dropdown, but the
 * shell around it stays server-rendered since the job list (and notification feed)
 * are fetched server-side by the caller, same pattern as `jobs`. Looks up the
 * current user itself (rather than taking `isAdmin` as a prop) so every one of
 * AppShell's many call sites doesn't need to thread it through — every caller has
 * already resolved this same user moments earlier, so this is one more cheap,
 * already-common redundant lookup (currentAppUser() isn't memoized anywhere in this
 * codebase), not a new pattern.
 *
 * `showJobSidebar` defaults true (Jobs / job-scoped views). Sales CRM surfaces
 * (Leads, Activities, Proposals, Materials, …) pass false — Buildertrend has no
 * job rail on Sales; the content is full-bleed under the top nav.
 */
export async function AppShell({
  jobs,
  activeJobId,
  notifications = [],
  unreadCount = 0,
  showJobSidebar = true,
  children,
}: {
  jobs: SidebarJob[];
  activeJobId?: string;
  notifications?: readonly BellNotification[];
  unreadCount?: number;
  showJobSidebar?: boolean;
  children: ReactNode;
}) {
  const user = await currentAppUser().catch(() => null);
  // Templates tab (JobSidebar.tsx) — fetched here rather than threaded through as a
  // prop so the ~80 existing AppShell callers, which already fetch and pass `jobs`
  // themselves, don't all need updating just to add this one tab. Skip the fetch
  // entirely when the rail is hidden (Sales) so we don't pay for unused templates.
  const templateJobs = showJobSidebar && user ? await sidebarTemplateJobsForOrg(user.organizationId) : [];

  return (
    <div className="flex h-screen flex-col">
      <TopNav
        activeJobId={activeJobId}
        clerkConfigured={isClerkConfigured()}
        isAdmin={user?.role === UserRole.ADMIN}
        userName={user?.name ?? ""}
        userEmail={user?.email ?? ""}
        userRoleLabel={user ? ROLE_DESCRIPTIONS[user.role].label : ""}
        notifications={notifications}
        unreadCount={unreadCount}
        jobs={jobs}
      />
      <div className="flex flex-1 overflow-hidden">
        {showJobSidebar ? <JobSidebar jobs={jobs} templateJobs={templateJobs} activeJobId={activeJobId} /> : null}
        <main className="flex-1 overflow-y-auto bg-[var(--bt-page-bg)]">{children}</main>
      </div>
      {isAnthropicConfigured() && isJarvisUiEnabled() ? <JarvisLauncher /> : null}
    </div>
  );
}
