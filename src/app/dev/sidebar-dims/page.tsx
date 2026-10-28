"use client";

/**
 * Local measurement harness for Jobs sidebar dimensions vs Buildertrend.
 * Client-only mock data — no DB. Not linked from nav; remove after parity sign-off
 * if undesired, but safe to leave for future dim regressions.
 */
import { JobSidebar, type SidebarJob } from "@/components/shell/JobSidebar";

const MOCK_JOBS: SidebarJob[] = [
  {
    id: "job_pine",
    name: "11296 Pine St",
    prefix: "8056",
    status: "OPEN",
    groupName: "General",
    clientName: "Lamb",
    address: "11296 Pine St, Jacksonville, FL 32258",
    qboLinked: true,
  },
  {
    id: "job_bancroft",
    name: "4802 Bancroft Remodel",
    prefix: null,
    status: "OPEN",
    groupName: "General",
    clientName: null,
    address: null,
    qboLinked: false,
  },
  {
    id: "job_riverside",
    name: "Riverside ADU",
    prefix: null,
    status: "PRE_SALE",
    groupName: "General",
    clientName: null,
    address: null,
    qboLinked: false,
  },
  {
    id: "job_oak",
    name: "Oak Street Spec",
    prefix: null,
    status: "OPEN",
    groupName: "General",
    clientName: null,
    address: null,
    qboLinked: false,
  },
];

export default function SidebarDimsPreviewPage() {
  return (
    <div className="flex h-screen flex-col bg-[var(--bt-page-bg)]">
      <div className="flex h-12 items-center bg-[var(--bt-nav)] px-4 text-sm font-semibold text-white">
        WCI OS · Jobs sidebar dimension preview
      </div>
      <div className="flex flex-1 overflow-hidden">
        <JobSidebar jobs={MOCK_JOBS} activeJobId="job_pine" />
        <main className="flex flex-1 flex-col gap-3 p-6 text-sm text-[var(--bt-text)]">
          <p id="measure-note">
            Measure the left rail against Buildertrend (default 203px wide, ~26px job rows). Drag the
            right edge to resize; preference persists in <code>localStorage</code> key{" "}
            <code>wci-job-sidebar-width</code>.
          </p>
          <p className="text-[var(--bt-muted)]">
            Tokens: <code>--bt-job-sidebar-width</code> (default), <code>--bt-job-sidebar-row-py</code>,{" "}
            <code>--bt-job-chrome-*</code> (tabs / Search / + Job / icon hit sizes)
          </p>
        </main>
      </div>
    </div>
  );
}
