import type { ReactNode } from "react";

import { JarvisLauncher } from "@/components/jarvis/JarvisLauncher";
import { isAnthropicConfigured, isClerkConfigured } from "@/lib/env";

import { JobSidebar, type SidebarJob } from "./JobSidebar";
import { TopNav, type BellNotification } from "./TopNav";

/**
 * The Buildertrend-match staff shell: top nav + left job sidebar + content slot.
 * Server component — TopNav is itself a client component for its dropdown, but the
 * shell around it stays server-rendered since the job list (and notification feed)
 * are fetched server-side by the caller, same pattern as `jobs`.
 */
export function AppShell({
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
  return (
    <div className="flex h-screen flex-col">
      <TopNav
        activeJobId={activeJobId}
        clerkConfigured={isClerkConfigured()}
        notifications={notifications}
        unreadCount={unreadCount}
      />
      <div className="flex flex-1 overflow-hidden">
        <JobSidebar jobs={jobs} activeJobId={activeJobId} />
        <main className="flex-1 overflow-y-auto bg-[#f7f8fa]">{children}</main>
      </div>
      {isAnthropicConfigured() ? <JarvisLauncher /> : null}
    </div>
  );
}
