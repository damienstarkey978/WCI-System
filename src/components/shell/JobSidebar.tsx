"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo, useState } from "react";

import { ChevronDownIcon, FunnelIcon, HomeIcon, SortIcon } from "./icons";

export interface SidebarJob {
  readonly id: string;
  readonly name: string;
  readonly prefix: string | null;
  readonly status: string;
  /** Falls back to "General" when the job has no JobGroup — matches Buildertrend's default bucket. */
  readonly groupName: string;
  /** The first client with portal access on this job, if any — shown on the active job's mini-card. */
  readonly clientName: string | null;
  readonly address: string | null;
  /** True once this job has a QuickBooks Customer Id (qboCustomerId) — shows BT's "QB" badge. */
  readonly qboLinked: boolean;
}

type SortMode = "recent" | "name";

/** Small "QB" chip Buildertrend shows on a job once it's linked to QuickBooks. */
function QbBadge() {
  return (
    <span className="shrink-0 rounded bg-[#2ca01c]/15 px-1 py-0.5 text-[9px] font-bold text-[#2ca01c]" title="Linked to QuickBooks">
      QB
    </span>
  );
}

const COLLAPSE_STORAGE_KEY = "wci-job-sidebar-collapsed";

const STATUS_FILTERS = ["ALL", "PRE_SALE", "OPEN", "WARRANTY", "CLOSED"] as const;
type StatusFilter = (typeof STATUS_FILTERS)[number];

const STATUS_FILTER_LABEL: Record<StatusFilter, string> = {
  ALL: "All",
  PRE_SALE: "Pre-Construction",
  OPEN: "In Progress",
  WARRANTY: "Warranty",
  CLOSED: "Closed",
};

const JOB_STATUS_LABEL: Record<string, string> = {
  PRE_SALE: "Pre-Construction",
  OPEN: "In Progress",
  WARRANTY: "Warranty",
  CLOSED: "Closed",
};

/**
 * Left panel used both on the /jobs index (no active job) and inside a job's own
 * layout (active job's mini-card pinned above the grouped job list) — the single
 * component the shared AppShell composes with TopNav, per CLAUDE.md's shell plan.
 * Client component for the collapse toggle and the search/status filter over the
 * job list — everything else about which jobs to show still comes from the server
 * (sidebarJobsForOrg already scopes it to what this user can open).
 *
 * Hidden entirely below `md` (a permanent 256px — or even the collapsed 48px —
 * column has no reasonable place on a phone-width screen): TopNav's hamburger
 * opens MobileMenuDrawer instead, which has its own simpler job jump-list.
 */
export function JobSidebar({
  jobs,
  templateJobs = [],
  activeJobId,
}: {
  jobs: SidebarJob[];
  /** Buildertrend's "Templates" tab — Job.isTemplate rows. Defaults to empty for any caller not yet passing it. */
  templateJobs?: SidebarJob[];
  activeJobId?: string;
}) {
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      return localStorage.getItem(COLLAPSE_STORAGE_KEY) === "true";
    } catch {
      return false;
    }
  });
  const [tab, setTab] = useState<"jobs" | "templates">("jobs");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [sortMode, setSortMode] = useState<SortMode>("recent");

  function toggleCollapsed() {
    setCollapsed((value) => {
      const next = !value;
      try {
        localStorage.setItem(COLLAPSE_STORAGE_KEY, String(next));
      } catch {
        // Best effort only — the toggle still works for this session either way.
      }
      return next;
    });
  }

  const activeJob = activeJobId ? jobs.find((job) => job.id === activeJobId) : undefined;

  // Preserve the current section (e.g. "/invoices") when switching jobs, so picking
  // a different job from the list doesn't bounce back to the job overview page —
  // just the top-level section, since a deeper id in the path (an invoice, a specific
  // schedule item) belongs to the job being left and won't exist under the new one.
  const pathname = usePathname();
  const activeSection = useMemo(() => {
    if (!activeJobId || !pathname) return null;
    const parts = pathname.split("/");
    if (parts[1] !== "jobs" || parts[2] !== activeJobId || !parts[3]) return null;
    return `/${parts[3]}`;
  }, [pathname, activeJobId]);

  function jobHref(jobId: string) {
    return activeSection ? `/jobs/${jobId}${activeSection}` : `/jobs/${jobId}`;
  }

  const filteredJobs = useMemo(() => {
    const q = query.trim().toLowerCase();
    const source = tab === "templates" ? templateJobs : jobs;
    const filtered = source.filter((job) => {
      if (tab === "jobs" && statusFilter !== "ALL" && job.status !== statusFilter) return false;
      if (!q) return true;
      return job.name.toLowerCase().includes(q) || (job.prefix?.toLowerCase().includes(q) ?? false);
    });
    if (sortMode === "name") return [...filtered].sort((a, b) => a.name.localeCompare(b.name));
    return filtered;
  }, [jobs, templateJobs, tab, query, statusFilter, sortMode]);

  const groups = useMemo(() => {
    const map = new Map<string, SidebarJob[]>();
    for (const job of filteredJobs) {
      const bucket = map.get(job.groupName) ?? [];
      bucket.push(job);
      map.set(job.groupName, bucket);
    }
    return map;
  }, [filteredJobs]);

  if (collapsed) {
    return (
      <aside
        className="hidden w-12 shrink-0 flex-col items-center border-r bg-[var(--bt-sidebar-bg)] py-2 md:flex"
        style={{ borderColor: "var(--bt-border)", width: "3rem" }}
      >
        <button
          type="button"
          onClick={toggleCollapsed}
          aria-label="Expand job list"
          title="Expand job list"
          className="rounded p-1.5 text-[var(--bt-muted)] hover:bg-black/5"
        >
          <ChevronDownIcon className="h-4 w-4 -rotate-90" />
        </button>
      </aside>
    );
  }

  return (
    <aside
      className="hidden shrink-0 flex-col border-r bg-[var(--bt-sidebar-bg)] md:flex"
      style={{ borderColor: "var(--bt-border)", width: "var(--bt-job-sidebar-width)" }}
    >
      <div className="flex items-start justify-between gap-2 border-b px-3 py-2.5" style={{ borderColor: "var(--bt-border)" }}>
        {activeJob ? (
          <Link href={`/jobs/${activeJob.id}`} className="flex min-w-0 flex-1 flex-col gap-1">
            <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-[var(--bt-muted)]">
              <HomeIcon className="h-3.5 w-3.5 shrink-0" />
              Current job
            </div>
            <div className="flex min-w-0 items-center gap-1.5">
              <span className="truncate text-sm font-semibold text-[var(--bt-text)]">{activeJob.name}</span>
              {activeJob.qboLinked ? <QbBadge /> : null}
            </div>
            {activeJob.clientName ? <div className="truncate text-xs text-[var(--bt-muted)]">{activeJob.clientName}</div> : null}
            {activeJob.address ? <div className="truncate text-xs text-[var(--bt-muted)]">{activeJob.address}</div> : null}
            <span
              className="w-fit rounded px-1.5 py-0.5 text-[10px] font-semibold"
              style={{ background: "var(--bt-status-open-bg)", color: "var(--bt-status-open-text)" }}
            >
              {JOB_STATUS_LABEL[activeJob.status] ?? activeJob.status.replace(/_/g, " ")}
            </span>
          </Link>
        ) : (
          <span className="text-sm font-semibold text-[var(--bt-text)]">Jobs</span>
        )}
        <button
          type="button"
          onClick={toggleCollapsed}
          aria-label="Collapse job list"
          title="Collapse job list"
          className="shrink-0 rounded p-1.5 text-[var(--bt-muted)] hover:bg-black/5"
        >
          <ChevronDownIcon className="h-4 w-4 rotate-90" />
        </button>
      </div>

      <div className="flex items-center justify-between border-b px-3 pt-2" style={{ borderColor: "var(--bt-border)" }}>
        <div className="flex gap-3 text-xs font-semibold">
          <button
            type="button"
            onClick={() => setTab("jobs")}
            className="border-b-2 pb-2"
            style={tab === "jobs" ? { borderColor: "var(--bt-primary)", color: "var(--bt-primary)" } : { borderColor: "transparent", color: "var(--bt-muted)" }}
          >
            Jobs
          </button>
          <button
            type="button"
            onClick={() => setTab("templates")}
            className="border-b-2 pb-2"
            style={tab === "templates" ? { borderColor: "var(--bt-primary)", color: "var(--bt-primary)" } : { borderColor: "transparent", color: "var(--bt-muted)" }}
          >
            Templates
          </button>
        </div>
        <Link
          href="/jobs/new"
          className="mb-1.5 rounded px-2.5 py-1 text-xs font-semibold text-[var(--bt-on-primary)]"
          style={{ background: "var(--bt-primary)" }}
        >
          + Job
        </Link>
      </div>

      <div className="flex flex-col gap-2 border-b px-3 py-2.5" style={{ borderColor: "var(--bt-border)" }}>
        <div className="flex items-center gap-1.5">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search jobs…"
            className="flex-1 rounded border px-2.5 py-1.5 text-sm outline-none focus:border-[var(--bt-primary)]"
            style={{ borderColor: "var(--bt-border)" }}
          />
          <button
            type="button"
            onClick={() => setSortMode((mode) => (mode === "recent" ? "name" : "recent"))}
            aria-label="Sort"
            title={sortMode === "recent" ? "Sorted by most recent — click to sort by name" : "Sorted by name — click to sort by most recent"}
            className="shrink-0 rounded border p-1.5 text-[var(--bt-muted)] hover:bg-black/5"
            style={{ borderColor: "var(--bt-border)" }}
          >
            <SortIcon className="h-3.5 w-3.5" />
          </button>
        </div>
        {tab === "jobs" ? (
          <div className="flex items-center gap-1.5">
            <FunnelIcon className="h-3.5 w-3.5 shrink-0 text-[var(--bt-muted)]" />
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
              className="flex-1 rounded border px-2.5 py-1.5 text-xs outline-none focus:border-[var(--bt-primary)]"
              style={{ borderColor: "var(--bt-border)" }}
            >
              {STATUS_FILTERS.map((status) => (
                <option key={status} value={status}>
                  {STATUS_FILTER_LABEL[status]} jobs
                </option>
              ))}
            </select>
          </div>
        ) : null}
      </div>

      <div className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--bt-muted)]">
        ALL {filteredJobs.length} {tab === "templates" ? "TEMPLATE" : statusFilter === "ALL" ? "" : STATUS_FILTER_LABEL[statusFilter].toUpperCase()} JOB
        {filteredJobs.length === 1 ? "" : "S"}
      </div>

      <div className="flex-1 overflow-y-auto pb-2">
        {[...groups.entries()].map(([groupName, groupJobs]) => (
          <div key={groupName} className="mb-2">
            <div className="px-3 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--bt-muted)]">
              {groupName}
            </div>
            {groupJobs.map((job) => {
              const isActive = job.id === activeJobId;
              return (
                <Link
                  key={job.id}
                  href={jobHref(job.id)}
                  className={`flex items-center gap-1.5 truncate px-3 text-[13px] leading-snug transition ${isActive ? "" : "hover:bg-black/5"}`}
                  style={
                    isActive
                      ? {
                          background: "color-mix(in srgb, var(--bt-primary) 18%, transparent)",
                          color: "var(--bt-primary)",
                          paddingTop: "var(--bt-job-sidebar-row-py)",
                          paddingBottom: "var(--bt-job-sidebar-row-py)",
                        }
                      : {
                          color: "var(--bt-text)",
                          paddingTop: "var(--bt-job-sidebar-row-py)",
                          paddingBottom: "var(--bt-job-sidebar-row-py)",
                        }
                  }
                >
                  <span className="truncate">
                    {job.prefix ? <span className="mr-1.5 font-mono text-[11px] text-[var(--bt-muted)]">{job.prefix}</span> : null}
                    {job.name}
                  </span>
                  {job.qboLinked ? <QbBadge /> : null}
                </Link>
              );
            })}
          </div>
        ))}

        {filteredJobs.length === 0 ? <p className="px-3 py-2 text-sm text-[var(--bt-muted)]">{tab === "templates" ? "No templates match." : "No jobs match."}</p> : null}
      </div>
    </aside>
  );
}
