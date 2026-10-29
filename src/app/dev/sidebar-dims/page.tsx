"use client";

/**
 * Local measurement harness for Jobs sidebar dimensions vs Buildertrend.
 * Client-only mock data — no DB. Not linked from nav; remove after parity sign-off
 * if undesired, but safe to leave for future dim regressions.
 *
 * Open with `?job=purcell` (default) to verify select→filter ("purcell" in Search,
 * VIEW 1 OPEN JOB). Clear the Search X to restore ALL N OPEN JOBS. `?job=none`
 * leaves the rail unfiltered (no active job card).
 */
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";

import { JobSidebar, type SidebarJob } from "@/components/shell/JobSidebar";

const MOCK_JOBS: SidebarJob[] = [
  {
    id: "job_purcell",
    name: "455 Purcell Drive-Janice Frasca Cabazares-ADU",
    prefix: null,
    status: "OPEN",
    groupName: "General",
    clientName: "Janice Frasca Cabazares",
    addressLine1: "455 Purcell Drive",
    cityLine: "Jacksonville, FL 32221",
    address: "455 Purcell Drive, Jacksonville",
    qboLinked: true,
  },
  {
    id: "job_pine",
    name: "11296 Pine St",
    prefix: "8056",
    status: "OPEN",
    groupName: "General",
    clientName: "Lamb",
    addressLine1: "11296 Pine St",
    cityLine: "Jacksonville, FL 32258",
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
    addressLine1: null,
    cityLine: null,
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
    addressLine1: null,
    cityLine: null,
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
    addressLine1: null,
    cityLine: null,
    address: null,
    qboLinked: false,
  },
];

function SidebarDimsInner() {
  const searchParams = useSearchParams();
  const activeJobId = searchParams.get("job") === "none" ? undefined : "job_purcell";
  /** `?cleared=1` — active Purcell card stays, but Search starts empty (SSR stand-in for after Search X). */
  const startCleared = searchParams.get("cleared") === "1";

  return (
    <div className="flex h-screen flex-col bg-[var(--bt-page-bg)]">
      <div className="flex h-12 items-center bg-[var(--bt-nav)] px-4 text-sm font-semibold text-white">
        WCI OS · Jobs sidebar dimension preview
      </div>
      <div className="flex flex-1 overflow-hidden">
        <JobSidebar
          jobs={MOCK_JOBS}
          activeJobId={activeJobId}
          organizationName="World Construction Inc."
          suppressSelectionFilter={startCleared}
        />
        <main className="flex flex-1 flex-col gap-3 p-6 text-sm text-[var(--bt-text)]">
          <p id="measure-note">
            Measure the left rail against Buildertrend (default 203px wide). Selecting a job fills Search
            (e.g. <code>purcell</code>) and switches the list to <strong>VIEW 1 OPEN JOB</strong> — clear
            with the Search X. Drag the right edge to resize; preference persists in{" "}
            <code>localStorage</code> key <code>wci-job-sidebar-width</code>.
          </p>
          <p className="text-[var(--bt-muted)]">
            Tokens: <code>--bt-job-sidebar-width</code>, <code>--bt-job-sidebar-row-py</code>,{" "}
            <code>--bt-job-selected-bg</code>, <code>--bt-job-card-accent</code>, <code>--bt-job-chrome-*</code>
          </p>
        </main>
      </div>
    </div>
  );
}

export default function SidebarDimsPreviewPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-[var(--bt-muted)]">Loading sidebar preview…</div>}>
      <SidebarDimsInner />
    </Suspense>
  );
}
