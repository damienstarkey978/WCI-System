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

/** Top-level nav items that don't depend on which job is selected. */
export const TOP_LEVEL_NAV = [
  { label: "Sales", href: "/leads" },
  { label: "Jobs", href: "/jobs" },
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
