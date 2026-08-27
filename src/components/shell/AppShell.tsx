import type { ReactNode } from "react";

import { isClerkConfigured } from "@/lib/env";

import { JobSidebar, type SidebarJob } from "./JobSidebar";
import { TopNav } from "./TopNav";

/**
 * The Buildertrend-match staff shell: top nav + left job sidebar + content slot.
 * Server component — TopNav is itself a client component for its dropdown, but the
 * shell around it stays server-rendered since the job list is fetched server-side.
 */
export function AppShell({
  jobs,
  activeJobId,
  children,
}: {
  jobs: SidebarJob[];
  activeJobId?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex h-screen flex-col">
      <TopNav activeJobId={activeJobId} clerkConfigured={isClerkConfigured()} />
      <div className="flex flex-1 overflow-hidden">
        <JobSidebar jobs={jobs} activeJobId={activeJobId} />
        <main className="flex-1 overflow-y-auto bg-[#f7f8fa]">{children}</main>
      </div>
    </div>
  );
}
