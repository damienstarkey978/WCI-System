/**
 * Shared nav structure for the Buildertrend-match staff shell
 * (src/components/shell) — kept as plain data so the top nav component and
 * any future breadcrumb/command-palette code read the same source of truth,
 * matching Buildertrend's actual top nav + "Project Management" dropdown
 * (confirmed against Damien's screenshots, 2026-08-27).
 */

export interface JobNavLink {
  readonly label: string;
  /** Appended to `/jobs/{jobId}` to build the href. Empty string = the job overview itself. */
  readonly path: string;
  readonly isNew?: boolean;
}

export interface JobsMenuItem {
  readonly label: string;
  /** "global" always works; "job" needs an active job (rendered muted otherwise);
   *  "soon" is a real Buildertrend item with no WCI OS feature behind it yet. */
  readonly kind: "global" | "job" | "soon";
  /** kind: "global" only. */
  readonly href?: string;
  /** kind: "job" only — appended to `/jobs/{jobId}`. Empty string = the job overview itself. */
  readonly jobPath?: string;
}

/**
 * The "Jobs" dropdown (per Damien's screenshot, 2026-08-29) — a mix of job-scoped
 * items (Job Info, Job Price Summary) and org-wide ones (everything else), unlike
 * Project Management/Files/Financial below, which are entirely job-scoped. "New Job
 * From Template" has no feature behind it yet — Job.isTemplate exists in the schema,
 * but there's no clone-from-template creation flow built on top of it — so it shows
 * as a real Buildertrend item rather than being silently dropped, but stays disabled
 * until that flow exists.
 */
export const JOBS_NAV: readonly JobsMenuItem[] = [
  { label: "Summary", kind: "global", href: "/dashboard" },
  { label: "Job Info", kind: "job", jobPath: "" },
  { label: "Job Price Summary", kind: "job", jobPath: "/budget" },
  { label: "Jobs List", kind: "global", href: "/jobs" },
  { label: "Job Groups", kind: "global", href: "/job-groups" },
  { label: "Jobs Map", kind: "global", href: "/jobs/map" },
  { label: "New Job From Scratch", kind: "global", href: "/admin/jobs" },
  { label: "New Job From Template", kind: "soon" },
];

/** The "Sales" dropdown — Buildertrend's CRM surface, none of it scoped to a selected job. */
export const SALES_NAV = [
  { label: "Lead Opportunities", href: "/leads" },
  { label: "Lead Activities", href: "/leads/activities" },
  { label: "Lead Proposals", href: "/leads/proposals" },
  { label: "Materials Catalog", href: "/materials" },
] as const;

/** The "Project Management" dropdown — every one of these is scoped to whichever job is selected. */
export const PROJECT_MANAGEMENT_NAV: readonly JobNavLink[] = [
  { label: "Schedule", path: "/schedule" },
  { label: "Daily Logs", path: "/daily-logs" },
  { label: "Tasks", path: "/tasks", isNew: true },
  { label: "Change Orders", path: "/change-orders" },
  { label: "Selections", path: "/selections" },
  { label: "Warranties", path: "/warranties" },
  { label: "Time Clock", path: "/time-clock" },
  { label: "Plans and Specs", path: "/plans-and-specs", isNew: true },
  { label: "Client Updates", path: "/client-updates" },
  { label: "Submittals", path: "/submittals", isNew: true },
  { label: "RFIs", path: "/rfis" },
  { label: "Surveys", path: "/surveys" },
];

/**
 * "Files" is its own top-nav dropdown in Buildertrend, not a single link —
 * all three route to the same Files tab (src/app/jobs/[jobId]/files), which
 * already supports a `?category=` filter, so the dropdown just picks the filter.
 */
export const FILES_NAV: readonly JobNavLink[] = [
  { label: "Documents", path: "/files?category=DOCUMENT" },
  { label: "Photos", path: "/files?category=PHOTO" },
  { label: "Videos", path: "/files?category=VIDEO" },
];

/** "Messaging" has no dropdown in Buildertrend — a single job-scoped link. */
export const MESSAGING_HREF = "/messages";

/** The "Financial" dropdown — every one of these is scoped to whichever job is selected. */
export const FINANCIAL_NAV: readonly JobNavLink[] = [
  { label: "Bids", path: "/bids" },
  { label: "Estimate", path: "/estimates" },
  { label: "Purchase Orders", path: "/purchase-orders" },
  { label: "Bills", path: "/bills" },
  { label: "Job Costing Budget", path: "/budget" },
  { label: "Cost Inbox", path: "/cost-inbox" },
  { label: "Invoices", path: "/invoices" },
  { label: "Online Payment Report", path: "/online-payment-report" },
];

export const REPORTS_HREF = "/reports";
