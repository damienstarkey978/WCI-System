"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

import { shouldShowJobPrefix } from "@/lib/job-display";

import { ChevronDownIcon, FunnelIcon, HomeIcon, InfoIcon, MailIcon, SearchIcon, SortIcon } from "./icons";

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
/** Persists the user's dragged rail width (CSS px). Default matches BT's measured 203. */
const WIDTH_STORAGE_KEY = "wci-job-sidebar-width";
/** Buildertrend default Jobs left rail — see docs/jobs-sidebar-width-remeasure.md. */
export const JOB_SIDEBAR_DEFAULT_WIDTH_PX = 203;
/** Narrow enough for the collapse strip feel without crushing search/filter chrome. */
export const JOB_SIDEBAR_MIN_WIDTH_PX = 170;
/** Upper bound in the BT "dragged wider" comfort range — not a full second column. */
export const JOB_SIDEBAR_MAX_WIDTH_PX = 440;

export function clampJobSidebarWidth(px: number): number {
  if (!Number.isFinite(px)) return JOB_SIDEBAR_DEFAULT_WIDTH_PX;
  return Math.min(JOB_SIDEBAR_MAX_WIDTH_PX, Math.max(JOB_SIDEBAR_MIN_WIDTH_PX, Math.round(px)));
}

function readStoredSidebarWidth(): number {
  if (typeof window === "undefined") return JOB_SIDEBAR_DEFAULT_WIDTH_PX;
  try {
    const raw = localStorage.getItem(WIDTH_STORAGE_KEY);
    if (raw == null || raw === "") return JOB_SIDEBAR_DEFAULT_WIDTH_PX;
    return clampJobSidebarWidth(Number(raw));
  } catch {
    return JOB_SIDEBAR_DEFAULT_WIDTH_PX;
  }
}

function persistSidebarWidth(px: number) {
  try {
    localStorage.setItem(WIDTH_STORAGE_KEY, String(clampJobSidebarWidth(px)));
  } catch {
    // Best effort — width still applies for this session.
  }
}

const STATUS_FILTERS = ["ALL", "PRE_SALE", "OPEN", "WARRANTY", "CLOSED"] as const;
type StatusFilter = (typeof STATUS_FILTERS)[number];

const STATUS_FILTER_LABEL: Record<StatusFilter, string> = {
  ALL: "All",
  PRE_SALE: "Pre-Construction",
  // Buildertrend's job badge + "ALL N OPEN JOBS" header use "Open", not "In Progress".
  OPEN: "Open",
  WARRANTY: "Warranty",
  CLOSED: "Closed",
};

const JOB_STATUS_LABEL: Record<string, string> = {
  PRE_SALE: "Pre-Construction",
  OPEN: "Open",
  WARRANTY: "Warranty",
  CLOSED: "Closed",
};

/**
 * Left panel used both on the /jobs index (no active job) and inside a job's own
 * layout (active job's mini-card pinned above the grouped job list) — the single
 * component the shared AppShell composes with TopNav, per CLAUDE.md's shell plan.
 * Client component for the collapse toggle, drag-resize (BT parity), and the
 * search/status filter over the job list — everything else about which jobs to
 * show still comes from the server (sidebarJobsForOrg already scopes it to what
 * this user can open). Width defaults to 203px and persists in localStorage.
 *
 * Hidden entirely below `md` (Buildertrend's 203px desktop rail / ~26px job rows —
 * or the collapsed 48px strip — has no reasonable place on a phone-width screen):
 * TopNav's hamburger opens MobileMenuDrawer instead, which has its own simpler
 * job jump-list. The resize handle is desktop-only for the same reason.
 */
export function JobSidebar({
  jobs,
  templateJobs = [],
  activeJobId,
  organizationName = "World Construction Inc.",
}: {
  jobs: SidebarJob[];
  /** Buildertrend's "Templates" tab — Job.isTemplate rows. Defaults to empty for any caller not yet passing it. */
  templateJobs?: SidebarJob[];
  activeJobId?: string;
  /** Shown above the Current Job card — matches BT's company name strip. */
  organizationName?: string;
}) {
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      return localStorage.getItem(COLLAPSE_STORAGE_KEY) === "true";
    } catch {
      return false;
    }
  });
  // Default 203 matches --bt-job-sidebar-width. Hydrate the persisted preference
  // after mount (SSR/hydration can't read localStorage without mismatching HTML).
  const [widthPx, setWidthPx] = useState(JOB_SIDEBAR_DEFAULT_WIDTH_PX);
  const [resizing, setResizing] = useState(false);
  const dragStartXRef = useRef(0);
  const dragStartWidthRef = useRef(JOB_SIDEBAR_DEFAULT_WIDTH_PX);
  const [tab, setTab] = useState<"jobs" | "templates">("jobs");
  const [query, setQuery] = useState("");
  // BT's Jobs rail defaults to Open jobs ("ALL N OPEN JOBS") with a filter badge of 1.
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("OPEN");
  const [filterOpen, setFilterOpen] = useState(false);
  const [sortMode, setSortMode] = useState<SortMode>("recent");

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- hydrate width from localStorage after mount (SSR-safe) */
    setWidthPx(readStoredSidebarWidth());
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  // Clear body cursor / selection lock if we unmount mid-drag.
  useEffect(() => {
    if (!resizing) return;
    return () => {
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
    };
  }, [resizing]);

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

  function onResizePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    // Only primary button / touch — ignore right-click.
    if (event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragStartXRef.current = event.clientX;
    dragStartWidthRef.current = widthPx;
    setResizing(true);
    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";
  }

  function onResizePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    const next = clampJobSidebarWidth(dragStartWidthRef.current + (event.clientX - dragStartXRef.current));
    setWidthPx(next);
  }

  function endResize(event: ReactPointerEvent<HTMLDivElement>) {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    event.currentTarget.releasePointerCapture(event.pointerId);
    const next = clampJobSidebarWidth(dragStartWidthRef.current + (event.clientX - dragStartXRef.current));
    setWidthPx(next);
    persistSidebarWidth(next);
    setResizing(false);
    document.body.style.userSelect = "";
    document.body.style.cursor = "";
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
      data-testid="job-sidebar"
      className={`relative hidden shrink-0 flex-col border-r bg-[var(--bt-sidebar-bg)] md:flex${resizing ? " select-none" : ""}`}
      style={{
        borderColor: "var(--bt-border)",
        // Inline px so a dragged preference overrides --bt-job-sidebar-width (still the CSS default).
        width: widthPx,
        minWidth: widthPx,
        maxWidth: widthPx,
      }}
    >
      {/* Desktop-only grabber: aside is already `hidden md:flex`, so this never shows on mobile. */}
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize job list"
        aria-valuenow={widthPx}
        aria-valuemin={JOB_SIDEBAR_MIN_WIDTH_PX}
        aria-valuemax={JOB_SIDEBAR_MAX_WIDTH_PX}
        data-testid="job-sidebar-resize-handle"
        onPointerDown={onResizePointerDown}
        onPointerMove={onResizePointerMove}
        onPointerUp={endResize}
        onPointerCancel={endResize}
        className="absolute top-0 right-0 z-10 h-full w-1.5 cursor-col-resize touch-none"
        style={{ marginRight: -3, width: 6 }}
        title="Drag to resize"
      />
      {/* Company strip + collapse — matches BT's "World Construction Inc." header. */}
      <div className="flex items-center justify-between gap-1.5 border-b px-2.5 py-2" style={{ borderColor: "var(--bt-border)" }}>
        <span
          className="min-w-0 truncate font-semibold"
          style={{
            fontFamily: "var(--bt-font-sans)",
            fontSize: "var(--bt-job-sidebar-font-size)",
            lineHeight: "var(--bt-job-sidebar-line-height)",
            letterSpacing: "var(--bt-job-sidebar-letter-spacing)",
            color: "var(--bt-job-sidebar-color)",
          }}
        >
          {organizationName}
        </span>
        <button
          type="button"
          onClick={toggleCollapsed}
          aria-label="Collapse job list"
          title="Collapse job list"
          className="shrink-0 rounded p-1 text-[var(--bt-muted)] hover:bg-black/5"
        >
          <ChevronDownIcon className="h-3.5 w-3.5 rotate-90" />
        </button>
      </div>

      {activeJob ? (
        <div className="border-b px-2.5 py-2" style={{ borderColor: "var(--bt-border)" }} data-testid="job-sidebar-current-card">
          <div className="flex items-start justify-between gap-1">
            <span
              className="w-fit rounded-full px-2 py-0.5 text-[10px] font-semibold"
              style={{ background: "var(--bt-status-open-bg)", color: "var(--bt-status-open-text)" }}
            >
              {JOB_STATUS_LABEL[activeJob.status] ?? activeJob.status.replace(/_/g, " ")}
            </span>
            <div className="flex shrink-0 items-center gap-0.5 text-[var(--bt-muted)]">
              <Link
                href={`/jobs/${activeJob.id}/settings`}
                aria-label="Job info"
                title="Job info"
                className="rounded p-0.5 hover:bg-black/5 hover:text-[var(--bt-primary)]"
              >
                <InfoIcon className="h-3.5 w-3.5" />
              </Link>
              <Link
                href={`/jobs/${activeJob.id}/messages`}
                aria-label="Messages"
                title="Messages"
                className="rounded p-0.5 hover:bg-black/5 hover:text-[var(--bt-primary)]"
              >
                <MailIcon className="h-3.5 w-3.5" />
              </Link>
              <Link
                href={`/jobs/${activeJob.id}`}
                aria-label="Job home"
                title="Job home"
                className="rounded p-0.5 hover:bg-black/5 hover:text-[var(--bt-primary)]"
              >
                <HomeIcon className="h-3.5 w-3.5" />
              </Link>
            </div>
          </div>
          <Link href={`/jobs/${activeJob.id}`} className="mt-1.5 block min-w-0">
            <div
              className="truncate font-semibold"
              style={{
                fontFamily: "var(--bt-font-sans)",
                fontSize: "var(--bt-job-sidebar-font-size)",
                lineHeight: "var(--bt-job-sidebar-line-height)",
                letterSpacing: "var(--bt-job-sidebar-letter-spacing)",
                color: "var(--bt-job-sidebar-color)",
              }}
            >
              {activeJob.name}
            </div>
            {activeJob.address ? <div className="truncate text-[11px] leading-snug text-[var(--bt-muted)]">{activeJob.address}</div> : null}
            {activeJob.clientName ? <div className="truncate text-[11px] leading-snug text-[var(--bt-muted)]">{activeJob.clientName}</div> : null}
          </Link>
        </div>
      ) : null}

      <div className="flex items-center justify-between gap-2 border-b px-2.5 py-1.5" style={{ borderColor: "var(--bt-border)" }}>
        <div className="flex min-w-0 flex-1 overflow-hidden rounded border text-[11px] font-semibold" style={{ borderColor: "var(--bt-border)" }}>
          <button
            type="button"
            onClick={() => setTab("jobs")}
            className="flex-1 px-2 py-1"
            style={
              tab === "jobs"
                ? { background: "var(--bt-panel-bg)", color: "var(--bt-text)", boxShadow: "inset 0 0 0 1px color-mix(in srgb, var(--bt-border) 80%, transparent)" }
                : { background: "transparent", color: "var(--bt-muted)" }
            }
          >
            Jobs
          </button>
          <button
            type="button"
            onClick={() => setTab("templates")}
            className="flex-1 px-2 py-1"
            style={
              tab === "templates"
                ? { background: "var(--bt-panel-bg)", color: "var(--bt-text)", boxShadow: "inset 0 0 0 1px color-mix(in srgb, var(--bt-border) 80%, transparent)" }
                : { background: "transparent", color: "var(--bt-muted)" }
            }
          >
            Templates
          </button>
        </div>
        <Link
          href="/jobs/new"
          className="shrink-0 rounded px-2 py-1 text-[11px] font-semibold text-[var(--bt-on-primary)]"
          style={{ background: "var(--bt-primary)" }}
        >
          + Job
        </Link>
      </div>

      <div className="flex items-center gap-1 border-b px-2.5 py-2" style={{ borderColor: "var(--bt-border)" }}>
        <div className="relative min-w-0 flex-1">
          <SearchIcon className="pointer-events-none absolute left-1.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--bt-muted)]" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search"
            className="w-full rounded border py-1 pl-6 pr-2 text-xs outline-none focus:border-[var(--bt-primary)]"
            style={{ borderColor: "var(--bt-border)" }}
          />
        </div>
        {tab === "jobs" ? (
          <div className="relative shrink-0">
            <button
              type="button"
              onClick={() => setFilterOpen((open) => !open)}
              onBlur={() => setTimeout(() => setFilterOpen(false), 150)}
              aria-label="Filter jobs"
              aria-expanded={filterOpen}
              title={`Filter: ${STATUS_FILTER_LABEL[statusFilter]}`}
              className="relative rounded border p-1 text-[var(--bt-muted)] hover:bg-black/5"
              style={{ borderColor: "var(--bt-border)" }}
            >
              <FunnelIcon className="h-3.5 w-3.5" />
              {statusFilter !== "ALL" ? (
                <span className="absolute -right-1.5 -top-1.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-[var(--bt-primary)] px-0.5 text-[9px] font-bold text-[var(--bt-on-primary)]">
                  1
                </span>
              ) : null}
            </button>
            {filterOpen ? (
              <div
                role="menu"
                className="absolute right-0 top-full z-20 mt-1 w-40 rounded border bg-[var(--bt-panel-bg)] py-1 text-xs shadow-lg"
                style={{ borderColor: "var(--bt-border)" }}
              >
                {STATUS_FILTERS.map((status) => (
                  <button
                    key={status}
                    type="button"
                    role="menuitem"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => {
                      setStatusFilter(status);
                      setFilterOpen(false);
                    }}
                    className="flex w-full items-center justify-between px-3 py-1.5 text-left hover:bg-black/5"
                    style={statusFilter === status ? { color: "var(--bt-primary)", fontWeight: 600 } : { color: "var(--bt-text)" }}
                  >
                    {STATUS_FILTER_LABEL[status]} jobs
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
        <button
          type="button"
          onClick={() => setSortMode((mode) => (mode === "recent" ? "name" : "recent"))}
          aria-label="Sort"
          title={sortMode === "recent" ? "Sorted by most recent — click to sort by name" : "Sorted by name — click to sort by most recent"}
          className="shrink-0 rounded border p-1 text-[var(--bt-muted)] hover:bg-black/5"
          style={{ borderColor: "var(--bt-border)" }}
        >
          <SortIcon className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--bt-muted)]">
        ALL {filteredJobs.length} {tab === "templates" ? "TEMPLATE" : statusFilter === "ALL" ? "" : STATUS_FILTER_LABEL[statusFilter].toUpperCase()} JOB
        {filteredJobs.length === 1 ? "" : "S"}
      </div>

      <div className="flex-1 overflow-y-auto pb-1.5">
        {[...groups.entries()].map(([groupName, groupJobs]) => {
          // BT's Open-jobs list is flat — hide the default "General" bucket label (and any
          // single-group header) so the rail doesn't show a redundant GENERAL strip.
          const showGroupHeader = groupName !== "General" && groups.size > 1;
          return (
            <div key={groupName} className="mb-0.5">
              {showGroupHeader ? (
                <div className="px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--bt-muted)]">{groupName}</div>
              ) : null}
              {groupJobs.map((job) => {
                const isActive = job.id === activeJobId;
                return (
                  <Link
                    key={job.id}
                    href={jobHref(job.id)}
                    data-testid="job-sidebar-row"
                    className={`flex items-center gap-1 truncate border-l-2 px-2.5 transition ${isActive ? "" : "border-transparent hover:bg-black/5"}`}
                    style={
                      isActive
                        ? {
                            borderLeftColor: "var(--bt-primary)",
                            background: "color-mix(in srgb, var(--bt-primary) 10%, transparent)",
                            color: "var(--bt-job-sidebar-color)",
                            fontFamily: "var(--bt-font-sans)",
                            fontSize: "var(--bt-job-sidebar-font-size)",
                            fontWeight: "var(--bt-job-sidebar-font-weight)",
                            lineHeight: "var(--bt-job-sidebar-line-height)",
                            letterSpacing: "var(--bt-job-sidebar-letter-spacing)",
                            paddingTop: "var(--bt-job-sidebar-row-py)",
                            paddingBottom: "var(--bt-job-sidebar-row-py)",
                          }
                        : {
                            color: "var(--bt-job-sidebar-color)",
                            fontFamily: "var(--bt-font-sans)",
                            fontSize: "var(--bt-job-sidebar-font-size)",
                            fontWeight: "var(--bt-job-sidebar-font-weight)",
                            lineHeight: "var(--bt-job-sidebar-line-height)",
                            letterSpacing: "var(--bt-job-sidebar-letter-spacing)",
                            paddingTop: "var(--bt-job-sidebar-row-py)",
                            paddingBottom: "var(--bt-job-sidebar-row-py)",
                          }
                    }
                  >
                    <span className="min-w-0 flex-1 truncate">
                      {shouldShowJobPrefix(job.name, job.prefix) ? (
                        <span className="mr-1 font-mono text-[11px] text-[var(--bt-muted)]">{job.prefix}</span>
                      ) : null}
                      {job.name}
                    </span>
                    {job.qboLinked ? <QbBadge /> : null}
                  </Link>
                );
              })}
            </div>
          );
        })}

        {filteredJobs.length === 0 ? <p className="px-2.5 py-2 text-xs text-[var(--bt-muted)]">{tab === "templates" ? "No templates match." : "No jobs match."}</p> : null}
      </div>
    </aside>
  );
}
