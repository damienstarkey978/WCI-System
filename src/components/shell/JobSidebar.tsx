"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

import { BRAND_LOGO_LIGHT_PATH } from "@/lib/branding/logo";
import { shouldShowJobPrefix } from "@/lib/job-display";

import { selectionFilterQuery } from "./job-sidebar-selection-filter";
import {
  ChevronDownIcon,
  CloseIcon,
  FunnelIcon,
  HomeIcon,
  InfoIcon,
  MailIcon,
  SearchIcon,
  SortIcon,
} from "./icons";

export interface SidebarJob {
  readonly id: string;
  readonly name: string;
  readonly prefix: string | null;
  readonly status: string;
  /** Falls back to "General" when the job has no JobGroup — matches Buildertrend's default bucket. */
  readonly groupName: string;
  /** The first client with portal access on this job, if any — shown on the active job's mini-card. */
  readonly clientName: string | null;
  /** Street line for the BT current-job card (above city/state/zip). */
  readonly addressLine1?: string | null;
  /** "City, ST ZIP" line for the BT current-job card. */
  readonly cityLine?: string | null;
  /** Compact single-line address (jump lists / older callers). */
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
 * Selecting a job mirrors Buildertrend: Search is filled with a short unique
 * token (e.g. "purcell"), the list header switches to "VIEW 1 OPEN JOB", and
 * other jobs disappear until the Search X clears the filter.
 *
 * Hidden entirely below `md` (Buildertrend's 203px desktop rail / ~32px job rows —
 * or the collapsed 48px strip — has no reasonable place on a phone-width screen):
 * TopNav's hamburger opens MobileMenuDrawer instead, which has its own simpler
 * job jump-list. The resize handle is desktop-only for the same reason.
 */
export function JobSidebar({
  jobs,
  templateJobs = [],
  activeJobId,
  organizationName = "World Construction Inc.",
  suppressSelectionFilter = false,
}: {
  jobs: SidebarJob[];
  /** Buildertrend's "Templates" tab — Job.isTemplate rows. Defaults to empty for any caller not yet passing it. */
  templateJobs?: SidebarJob[];
  activeJobId?: string;
  /** Shown above the Current Job card — matches BT's company name strip. */
  organizationName?: string;
  /**
   * Dev/harness only: skip BT select→filter seeding so Search starts empty while
   * `activeJobId` stays set (SSR stand-in for after the Search X). Production
   * StaffShell never passes this.
   */
  suppressSelectionFilter?: boolean;
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
  // Seed Search from the active job on first paint (BT select→filter) so the list
  // never flashes "ALL N OPEN JOBS" before the effect runs.
  const [query, setQuery] = useState(() => {
    if (suppressSelectionFilter || !activeJobId) return "";
    const job = jobs.find((row) => row.id === activeJobId) ?? templateJobs.find((row) => row.id === activeJobId);
    return job ? selectionFilterQuery(job, jobs.length > 0 ? jobs : templateJobs) : "";
  });
  // BT's Jobs rail defaults to Open jobs ("ALL N OPEN JOBS") with a filter badge of 1.
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("OPEN");
  const [filterOpen, setFilterOpen] = useState(false);
  const [sortMode, setSortMode] = useState<SortMode>("recent");
  /** Last job id we auto-filled Search for — clearing X keeps this so we don't re-filter until navigation. */
  const autoFilteredJobIdRef = useRef<string | null>(
    suppressSelectionFilter ? activeJobId ?? null : activeJobId ?? null,
  );

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

  // BT select → filter: opening a job fills Search with a unique token and collapses the list.
  useEffect(() => {
    if (suppressSelectionFilter) {
      autoFilteredJobIdRef.current = activeJobId ?? null;
      return;
    }
    if (!activeJobId) {
      autoFilteredJobIdRef.current = null;
      return;
    }
    if (autoFilteredJobIdRef.current === activeJobId) return;
    const source = tab === "templates" ? templateJobs : jobs;
    const job = source.find((row) => row.id === activeJobId) ?? jobs.find((row) => row.id === activeJobId);
    if (!job) return;
    const peers = source.length > 0 ? source : jobs;
    const next = selectionFilterQuery(job, peers);
    autoFilteredJobIdRef.current = activeJobId;
    /* eslint-disable react-hooks/set-state-in-effect -- BT select→filter mirrors navigation into Search */
    setQuery(next);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [activeJobId, jobs, templateJobs, tab, suppressSelectionFilter]);

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

  function clearSearch() {
    setQuery("");
    // Keep autoFilteredJobIdRef so clearing while still on the same job does not
    // immediately re-apply the select→filter — matches BT's Search X.
  }

  const activeJob = activeJobId
    ? (jobs.find((job) => job.id === activeJobId) ?? templateJobs.find((job) => job.id === activeJobId))
    : undefined;

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
      return (
        job.name.toLowerCase().includes(q) ||
        (job.prefix?.toLowerCase().includes(q) ?? false) ||
        (job.addressLine1?.toLowerCase().includes(q) ?? false) ||
        (job.address?.toLowerCase().includes(q) ?? false) ||
        (job.clientName?.toLowerCase().includes(q) ?? false)
      );
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

  const listIsSearchFiltered = query.trim().length > 0;
  const listCountLabel = tab === "templates" ? "TEMPLATE" : statusFilter === "ALL" ? "" : STATUS_FILTER_LABEL[statusFilter].toUpperCase();
  const listHeader = `${listIsSearchFiltered ? "VIEW" : "ALL"} ${filteredJobs.length}${listCountLabel ? ` ${listCountLabel}` : ""} JOB${
    filteredJobs.length === 1 ? "" : "S"
  }`;

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
          className="rounded border p-1.5 text-[var(--bt-muted)] hover:bg-black/5"
          style={{ borderColor: "var(--bt-border)" }}
        >
          <ChevronDownIcon className="h-3.5 w-3.5 -rotate-90" />
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
      <div className="flex items-center justify-between gap-1.5 border-b px-2 py-2" style={{ borderColor: "var(--bt-border)" }}>
        <div className="flex min-w-0 items-center gap-1.5">
          {/* eslint-disable-next-line @next/next/no-img-element -- fixed brand mark on light rail */}
          <img src={BRAND_LOGO_LIGHT_PATH} alt="" className="h-4 w-auto max-w-[28px] shrink-0 object-contain object-left" />
          <span
            className="min-w-0 truncate"
            style={{
              fontFamily: "var(--bt-font-sans)",
              fontSize: "var(--bt-job-sidebar-header-size)",
              fontWeight: 700,
              lineHeight: "var(--bt-job-sidebar-line-height)",
              letterSpacing: "var(--bt-job-sidebar-letter-spacing)",
              color: "var(--bt-job-sidebar-color)",
            }}
          >
            {organizationName}
          </span>
        </div>
        <button
          type="button"
          onClick={toggleCollapsed}
          aria-label="Collapse job list"
          title="Collapse job list"
          className="shrink-0 rounded border p-1 text-[var(--bt-muted)] hover:bg-black/5"
          style={{ borderColor: "var(--bt-border)" }}
        >
          <ChevronDownIcon className="h-3.5 w-3.5 rotate-90" />
        </button>
      </div>

      {activeJob ? (
        <div className="border-b px-2 py-2" style={{ borderColor: "var(--bt-border)" }} data-testid="job-sidebar-current-card">
          <div
            className="relative overflow-hidden rounded border bg-[var(--bt-panel-bg)] pl-2.5 pr-1.5 pt-1.5 pb-2"
            style={{ borderColor: "var(--bt-border)" }}
          >
            <span
              aria-hidden="true"
              className="absolute inset-y-0 left-0 w-[3px]"
              style={{ background: "var(--bt-job-card-accent)" }}
            />
            <div className="flex items-start justify-between gap-1">
              <span
                className="w-fit rounded px-1.5 py-0.5 text-[10px] font-semibold"
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
                  <InfoIcon className="h-4 w-4" />
                </Link>
                <Link
                  href={`/jobs/${activeJob.id}/messages`}
                  aria-label="Messages"
                  title="Messages"
                  className="rounded p-0.5 hover:bg-black/5 hover:text-[var(--bt-primary)]"
                >
                  <MailIcon className="h-4 w-4" />
                </Link>
                <Link
                  href={`/jobs/${activeJob.id}`}
                  aria-label="Job home"
                  title="Job home"
                  className="rounded p-0.5 hover:bg-black/5 hover:text-[var(--bt-primary)]"
                >
                  <HomeIcon className="h-4 w-4" />
                </Link>
              </div>
            </div>
            <Link href={`/jobs/${activeJob.id}`} className="mt-1.5 block min-w-0">
              <div
                className="truncate"
                style={{
                  fontFamily: "var(--bt-font-sans)",
                  fontSize: "var(--bt-job-sidebar-card-title-size)",
                  fontWeight: 700,
                  lineHeight: "var(--bt-job-sidebar-line-height)",
                  letterSpacing: "var(--bt-job-sidebar-letter-spacing)",
                  color: "var(--bt-job-sidebar-color)",
                }}
              >
                {activeJob.name}
              </div>
              {/* BT order: client → street → city/ST ZIP */}
              {activeJob.clientName ? (
                <div
                  className="truncate text-[var(--bt-muted)]"
                  style={{
                    fontFamily: "var(--bt-font-sans)",
                    fontSize: "var(--bt-job-sidebar-meta-size)",
                    lineHeight: "var(--bt-job-sidebar-meta-lh)",
                  }}
                >
                  {activeJob.clientName}
                </div>
              ) : null}
              {activeJob.addressLine1 ? (
                <div
                  className="truncate text-[var(--bt-muted)]"
                  style={{
                    fontFamily: "var(--bt-font-sans)",
                    fontSize: "var(--bt-job-sidebar-meta-size)",
                    lineHeight: "var(--bt-job-sidebar-meta-lh)",
                  }}
                >
                  {activeJob.addressLine1}
                </div>
              ) : activeJob.address ? (
                <div
                  className="truncate text-[var(--bt-muted)]"
                  style={{
                    fontFamily: "var(--bt-font-sans)",
                    fontSize: "var(--bt-job-sidebar-meta-size)",
                    lineHeight: "var(--bt-job-sidebar-meta-lh)",
                  }}
                >
                  {activeJob.address}
                </div>
              ) : null}
              {activeJob.cityLine ? (
                <div
                  className="truncate text-[var(--bt-muted)]"
                  style={{
                    fontFamily: "var(--bt-font-sans)",
                    fontSize: "var(--bt-job-sidebar-meta-size)",
                    lineHeight: "var(--bt-job-sidebar-meta-lh)",
                  }}
                >
                  {activeJob.cityLine}
                </div>
              ) : null}
            </Link>
          </div>
        </div>
      ) : null}

      {/* Control chrome — heights/radii/gaps match BT (see docs/jobs-sidebar-controls-parity.md).
          + Job fill uses WCI --bt-primary teal (not BT #1F4ECD). Resize handle stays above. */}
      <div
        data-testid="job-sidebar-controls"
        className="flex flex-col border-b px-2.5 py-2"
        style={{ borderColor: "var(--bt-border)", gap: "var(--bt-job-chrome-row-gap)" }}
      >
        <div className="flex items-center justify-between gap-2">
          <div
            role="tablist"
            aria-label="Jobs or templates"
            className="flex min-w-0 flex-1 items-stretch p-0.5"
            style={{
              height: "var(--bt-job-chrome-control-h)",
              borderRadius: "var(--bt-job-chrome-pill-radius)",
              background: "var(--bt-job-chrome-pill-track)",
            }}
          >
            <button
              type="button"
              role="tab"
              aria-selected={tab === "jobs"}
              onClick={() => setTab("jobs")}
              className="min-w-0 flex-1 rounded-[6px] px-2 text-[13px] font-semibold transition"
              style={
                tab === "jobs"
                  ? {
                      background: "var(--bt-panel-bg)",
                      color: "var(--bt-job-sidebar-color)",
                      boxShadow: "0 1px 2px rgba(16, 24, 40, 0.08), 0 0 0 1px rgba(16, 24, 40, 0.04)",
                    }
                  : { background: "transparent", color: "var(--bt-muted)", fontWeight: 500 }
              }
            >
              Jobs
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === "templates"}
              onClick={() => setTab("templates")}
              className="min-w-0 flex-1 rounded-[6px] px-2 text-[13px] font-semibold transition"
              style={
                tab === "templates"
                  ? {
                      background: "var(--bt-panel-bg)",
                      color: "var(--bt-job-sidebar-color)",
                      boxShadow: "0 1px 2px rgba(16, 24, 40, 0.08), 0 0 0 1px rgba(16, 24, 40, 0.04)",
                    }
                  : { background: "transparent", color: "var(--bt-muted)", fontWeight: 500 }
              }
            >
              Templates
            </button>
          </div>
          <Link
            href="/jobs/new"
            data-testid="job-sidebar-new-job"
            className="inline-flex shrink-0 items-center justify-center text-[14px] font-semibold text-[var(--bt-on-primary)]"
            style={{
              height: "var(--bt-job-chrome-btn-h)",
              paddingLeft: "var(--bt-job-chrome-btn-px)",
              paddingRight: "var(--bt-job-chrome-btn-px)",
              borderRadius: "var(--bt-job-chrome-btn-radius)",
              background: "var(--bt-primary)",
            }}
          >
            + Job
          </Link>
        </div>

        <div className="flex items-center gap-1">
          <div className="relative min-w-0 flex-1">
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search"
              aria-label="Search jobs"
              data-testid="job-sidebar-search"
              className="w-full outline-none focus:border-[var(--bt-primary)]"
              style={{
                height: "var(--bt-job-chrome-control-h)",
                borderRadius: "var(--bt-job-chrome-input-radius)",
                borderWidth: 1,
                borderStyle: "solid",
                borderColor: "var(--bt-job-chrome-input-border)",
                paddingLeft: 12,
                paddingRight: 36,
                fontFamily: "var(--bt-font-sans)",
                fontSize: "var(--bt-job-sidebar-font-size)",
                lineHeight: "var(--bt-job-sidebar-line-height)",
                color: "var(--bt-job-sidebar-color)",
                background: "var(--bt-panel-bg)",
              }}
            />
            {/* BT: magnifier when empty; X clear when Search has a value (select→filter or typed). */}
            {query ? (
              <button
                type="button"
                onClick={clearSearch}
                aria-label="Clear search"
                data-testid="job-sidebar-search-clear"
                className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded text-[var(--bt-muted)] hover:bg-black/5 hover:text-[var(--bt-job-sidebar-color)]"
              >
                <CloseIcon className="h-3.5 w-3.5" />
              </button>
            ) : (
              <SearchIcon className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--bt-muted)]" />
            )}
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
                data-testid="job-sidebar-filter"
                className="relative inline-flex items-center justify-center text-[var(--bt-muted)] hover:bg-black/5"
                style={{
                  width: "var(--bt-job-chrome-icon-hit)",
                  height: "var(--bt-job-chrome-icon-hit)",
                  borderRadius: 6,
                }}
              >
                <FunnelIcon className="h-[18px] w-[18px]" />
                {statusFilter !== "ALL" ? (
                  <span
                    className="absolute right-0.5 top-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full px-0.5 text-[9px] font-bold text-white"
                    style={{ background: "var(--bt-job-filter-badge-bg)" }}
                  >
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
            data-testid="job-sidebar-sort"
            className="inline-flex shrink-0 items-center justify-center text-[var(--bt-muted)] hover:bg-black/5"
            style={{
              width: "var(--bt-job-chrome-icon-hit)",
              height: "var(--bt-job-chrome-icon-hit)",
              borderRadius: 6,
            }}
          >
            <SortIcon className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div
        className="px-2.5 font-semibold uppercase tracking-wide text-[var(--bt-muted)]"
        data-testid="job-sidebar-list-header"
        style={{
          paddingTop: "var(--bt-job-chrome-list-gap)",
          paddingBottom: 6,
          fontFamily: "var(--bt-font-sans)",
          fontSize: 10,
          letterSpacing: "0.04em",
        }}
      >
        {listHeader}
      </div>

      <div className="flex-1 overflow-y-auto px-1.5 pb-1.5">
        {[...groups.entries()].map(([groupName, groupJobs]) => {
          // BT's Open-jobs list is flat — hide the default "General" bucket label (and any
          // single-group header) so the rail doesn't show a redundant GENERAL strip.
          const showGroupHeader = groupName !== "General" && groups.size > 1;
          return (
            <div key={groupName} className="mb-0.5">
              {showGroupHeader ? (
                <div className="px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--bt-muted)]">{groupName}</div>
              ) : null}
              {groupJobs.map((job) => {
                const isActive = job.id === activeJobId;
                return (
                  <Link
                    key={job.id}
                    href={jobHref(job.id)}
                    data-testid="job-sidebar-row"
                    data-active={isActive ? "true" : "false"}
                    className={`flex items-center gap-2 truncate px-2 transition ${isActive ? "rounded-md" : "rounded-md hover:bg-black/5"}`}
                    style={{
                      background: isActive ? "var(--bt-job-selected-bg)" : undefined,
                      color: "var(--bt-job-sidebar-color)",
                      fontFamily: "var(--bt-font-sans)",
                      fontSize: "var(--bt-job-sidebar-font-size)",
                      fontWeight: "var(--bt-job-sidebar-font-weight)",
                      lineHeight: "var(--bt-job-sidebar-line-height)",
                      letterSpacing: "var(--bt-job-sidebar-letter-spacing)",
                      paddingTop: "var(--bt-job-sidebar-row-py)",
                      paddingBottom: "var(--bt-job-sidebar-row-py)",
                    }}
                  >
                    {isActive ? (
                      <span
                        aria-hidden="true"
                        className="h-2 w-2 shrink-0 rounded-full"
                        style={{ background: "var(--bt-job-status-dot)" }}
                        data-testid="job-sidebar-status-dot"
                      />
                    ) : (
                      <span aria-hidden="true" className="h-2 w-2 shrink-0" />
                    )}
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
