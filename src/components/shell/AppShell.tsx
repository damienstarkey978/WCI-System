import type { ReactNode } from "react";

import { JarvisLauncher } from "@/components/jarvis/JarvisLauncher";
import { UserRole } from "@/generated/prisma/enums";
import { currentAppUser } from "@/lib/auth";
import { isAnthropicConfigured, isClerkConfigured } from "@/lib/env";

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
 */
export async function AppShell({
  jobs,
  activeJobId,
  notifications = [],
  unreadCount = 0,
  children,
}: {
  jobs: SidebarJob[];
  activeJobId?: string;
  notifications?: readonly BellNotification[];
  unreadCount?: number;
  children: ReactNode;
}) {
  const user = await currentAppUser().catch(() => null);

  return (
    <div className="flex h-screen flex-col">
      <TopNav
        activeJobId={activeJobId}
        clerkConfigured={isClerkConfigured()}
        isAdmin={user?.role === UserRole.ADMIN}
        notifications={notifications}
        unreadCount={unreadCount}
      />
      <div className="flex flex-1 overflow-hidden">
        <JobSidebar jobs={jobs} activeJobId={activeJobId} />
        <main className="flex-1 overflow-y-auto bg-[var(--bt-page-bg)]">{children}</main>
      </div>
      {isAnthropicConfigured() ? <JarvisLauncher /> : null}
    </div>
  );
}
