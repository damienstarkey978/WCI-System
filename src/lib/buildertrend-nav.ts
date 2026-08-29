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

/**
 * The "Jobs" dropdown. Buildertrend also lists "Summary", "Job Info", and
 * "Jobs Map" here — skipped for now: the first two are per-job tabs already
 * covered by the job Overview page reached from the sidebar, and a map view
 * needs a geocoding/maps integration that doesn't exist yet. "New Job From
 * Template" is skipped too — there's no job-template concept in the schema
 * yet, so it would be a new feature, not just a nav link.
 */
export const JOBS_NAV = [
  { label: "Jobs List", href: "/jobs" },
  { label: "Job Groups", href: "/job-groups" },
  { label: "Job Price Summary", href: "/reports?report=profitability" },
  { label: "New Job From Scratch", href: "/admin/jobs" },
] as const;

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
