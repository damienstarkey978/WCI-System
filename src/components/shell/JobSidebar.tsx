"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { ChevronDownIcon, HomeIcon } from "./icons";

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
}

const COLLAPSE_STORAGE_KEY = "wci-job-sidebar-collapsed";

const STATUS_FILTERS = ["ALL", "PRE_SALE", "OPEN", "WARRANTY", "CLOSED"] as const;
type StatusFilter = (typeof STATUS_FILTERS)[number];

const STATUS_FILTER_LABEL: Record<StatusFilter, string> = {
  ALL: "All",
  PRE_SALE: "Pre-sale",
  OPEN: "Open",
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
 */
export function JobSidebar({ jobs, activeJobId }: { jobs: SidebarJob[]; activeJobId?: string }) {
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      return localStorage.getItem(COLLAPSE_STORAGE_KEY) === "true";
    } catch {
      return false;
    }
  });
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");

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

  const filteredJobs = useMemo(() => {
    const q = query.trim().toLowerCase();
    return jobs.filter((job) => {
      if (statusFilter !== "ALL" && job.status !== statusFilter) return false;
      if (!q) return true;
      return job.name.toLowerCase().includes(q) || (job.prefix?.toLowerCase().includes(q) ?? false);
    });
  }, [jobs, query, statusFilter]);

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
        className="flex w-12 shrink-0 flex-col items-center border-r bg-[var(--bt-sidebar-bg)] py-2"
        style={{ borderColor: "var(--bt-border)" }}
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
      className="flex w-64 shrink-0 flex-col border-r bg-[var(--bt-sidebar-bg)]"
      style={{ borderColor: "var(--bt-border)" }}
    >
      <div className="flex items-start justify-between gap-2 border-b px-4 py-3" style={{ borderColor: "var(--bt-border)" }}>
        {activeJob ? (
          <Link href={`/jobs/${activeJob.id}`} className="flex min-w-0 flex-1 flex-col gap-1">
            <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-[var(--bt-muted)]">
              <HomeIcon className="h-3.5 w-3.5 shrink-0" />
              Current job
            </div>
            <div className="truncate text-sm font-semibold text-[var(--bt-text)]">{activeJob.name}</div>
            {activeJob.clientName ? <div className="truncate text-xs text-[var(--bt-muted)]">{activeJob.clientName}</div> : null}
            {activeJob.address ? <div className="truncate text-xs text-[var(--bt-muted)]">{activeJob.address}</div> : null}
            <span
              className="w-fit rounded px-1.5 py-0.5 text-[10px] font-semibold"
              style={{ background: "var(--bt-status-open-bg)", color: "var(--bt-status-open-text)" }}
            >
              {activeJob.status.replace(/_/g, " ")}
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

      <div className="flex flex-col gap-2 border-b px-3 py-2.5" style={{ borderColor: "var(--bt-border)" }}>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search jobs…"
          className="rounded border px-2.5 py-1.5 text-sm outline-none focus:border-[var(--bt-primary)]"
          style={{ borderColor: "var(--bt-border)" }}
        />
        <select
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
          className="rounded border px-2.5 py-1.5 text-xs outline-none focus:border-[var(--bt-primary)]"
          style={{ borderColor: "var(--bt-border)" }}
        >
          {STATUS_FILTERS.map((status) => (
            <option key={status} value={status}>
              {STATUS_FILTER_LABEL[status]} jobs
            </option>
          ))}
        </select>
      </div>

      <div className="px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--bt-muted)]">
        {filteredJobs.length} {statusFilter === "ALL" ? "" : `${STATUS_FILTER_LABEL[statusFilter].toLowerCase()} `}job
        {filteredJobs.length === 1 ? "" : "s"}
      </div>

      <div className="flex-1 overflow-y-auto pb-2">
        {[...groups.entries()].map(([groupName, groupJobs]) => (
          <div key={groupName} className="mb-3">
            <div className="px-4 py-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--bt-muted)]">
              {groupName}
            </div>
            {groupJobs.map((job) => {
              const isActive = job.id === activeJobId;
              return (
                <Link
                  key={job.id}
                  href={`/jobs/${job.id}`}
                  className={`block truncate px-4 py-1.5 text-sm transition ${isActive ? "" : "hover:bg-black/5"}`}
                  style={
                    isActive
                      ? { background: "var(--bt-status-open-bg)", color: "var(--bt-status-open-text)" }
                      : { color: "var(--bt-text)" }
                  }
                >
                  {job.prefix ? <span className="mr-1.5 font-mono text-xs text-[var(--bt-muted)]">{job.prefix}</span> : null}
                  {job.name}
                </Link>
              );
            })}
          </div>
        ))}

        {filteredJobs.length === 0 ? <p className="px-4 py-2 text-sm text-[var(--bt-muted)]">No jobs match.</p> : null}
      </div>
    </aside>
  );
}
