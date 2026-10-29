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
  { label: "Job Info", kind: "job", jobPath: "/settings" },
  { label: "Job Price Summary", kind: "job", jobPath: "/budget" },
  { label: "Jobs List", kind: "global", href: "/jobs" },
  { label: "Job Groups", kind: "global", href: "/job-groups" },
  { label: "Jobs Map", kind: "global", href: "/jobs/map" },
  { label: "New Job From Scratch", kind: "global", href: "/jobs/new" },
  { label: "New Job From Template", kind: "soon" },
];

/**
 * The "Sales" dropdown — Buildertrend's CRM surface, none of it scoped to a selected
 * job. Activity Templates is a real Buildertrend item with no
 * WCI OS feature behind it yet — left off rather than linking somewhere dead,
 * matching how "New Job From Template" is handled in JOBS_NAV above.
 */
export const SALES_NAV = [
  { label: "Lead Opportunities", href: "/leads" },
  { label: "Lead Activities", href: "/leads/activities" },
  { label: "Lead Proposals", href: "/leads/proposals" },
  { label: "Proposal Templates", href: "/leads/proposal-templates" },
  { label: "Lead Activity Calendar", href: "/leads/calendar" },
  { label: "Lead Map", href: "/leads/map" },
  { label: "Materials Catalog", href: "/materials" },
] as const;

/**
 * The People icon's dropdown (top-right of the bar) — Buildertrend's three contact
 * directories. `icon` picks the glyph in TopNav's PeopleDropdown; kept as a string key
 * here so this file stays free of React imports.
 */
export const PEOPLE_NAV = [
  { label: "Internal Users", href: "/staff", icon: "users" },
  { label: "Subs/Vendors", href: "/vendors", icon: "hammer" },
  { label: "Client Contacts", href: "/clients", icon: "home" },
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
  { label: "Takeoffs", path: "/takeoffs", isNew: true },
  { label: "Purchasing", path: "/purchasing", isNew: true },
  { label: "Client Updates", path: "/client-updates" },
  { label: "Permitting", path: "/permitting", isNew: true },
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
  { label: "Inspection Pictures", path: "/files/inspection-pictures", isNew: true },
];

/**
 * The "Messaging" dropdown (per Damien's screenshot, 2026-08-29): Comments, Messages,
 * and Surveys are job-scoped; Notification History is org-wide, same "job" vs "global"
 * mix JOBS_NAV above already models. RFIs and Surveys moved here from
 * PROJECT_MANAGEMENT_NAV to match Buildertrend's real grouping — same pages, just
 * filed under the menu they actually live under.
 */
export const MESSAGING_NAV: readonly JobsMenuItem[] = [
  { label: "Comments", kind: "job", jobPath: "/comments" },
  { label: "Messages", kind: "job", jobPath: "/messages" },
  { label: "RFIs", kind: "job", jobPath: "/rfis" },
  { label: "Notification History", kind: "global", href: "/notifications" },
  { label: "Surveys", kind: "job", jobPath: "/surveys" },
];

/** The "Financial" dropdown — every one of these is scoped to whichever job is selected. */
export const FINANCIAL_NAV: readonly JobNavLink[] = [
  { label: "Bids", path: "/bids" },
  // Job Costing Budget is the commitment-funnel screen (BT JobCostingBudget). Estimate
  // worksheets stay at /jobs/{id}/estimates for Send-to-Budget / revisions, but are not
  // a Financial nav item — Jarvis drafting lives on Leads → Proposals only.
  { label: "Job Costing Budget", path: "/budget" },
  { label: "Purchase Orders", path: "/purchase-orders" },
  { label: "Bills", path: "/bills" },
  { label: "Cost Inbox", path: "/cost-inbox" },
  { label: "Invoices", path: "/invoices" },
  { label: "Online Payment Report", path: "/online-payment-report" },
];

/** Sales Rep with job financials OFF — Financial menu still opens, Commission only. */
export const COMMISSION_NAV_ITEM: JobNavLink = { label: "Commission", path: "/commission" };

/**
 * Financial dropdown items for the current staff user. Sales Reps without job
 * financials still get Commission; with financials on they get the full list
 * plus Commission. Other roles never see Commission.
 */
export function financialNavForAccess(input: {
  readonly canAccessFinancials: boolean;
  readonly showCommission: boolean;
}): readonly JobNavLink[] {
  if (input.canAccessFinancials && input.showCommission) {
    return [...FINANCIAL_NAV, COMMISSION_NAV_ITEM];
  }
  if (input.canAccessFinancials) return FINANCIAL_NAV;
  if (input.showCommission) return [COMMISSION_NAV_ITEM];
  return [];
}

export const REPORTS_HREF = "/reports";

/**
 * The top bar's "+" quick-add button — Buildertrend's full list, in Buildertrend's
 * own order. Each item either jumps straight to the page that already has the real
 * create action on it (job-scoped items need an active job, same "job"/"global"
 * split as JOBS_NAV), or — once each page gets its own modal/drawer per the shell
 * parity pass — opens that create form directly. Reuses JobsMenuItem's shape rather
 * than inventing a fourth nav-item type.
 */
export const QUICK_ADD_NAV: readonly JobsMenuItem[] = [
  { label: "Bid Package", kind: "job", jobPath: "/bids" },
  { label: "Bill", kind: "job", jobPath: "/bills" },
  { label: "Change Order", kind: "job", jobPath: "/change-orders" },
  { label: "Client Contact", kind: "global", href: "/clients" },
  { label: "Daily Log", kind: "job", jobPath: "/daily-logs" },
  { label: "Internal User", kind: "global", href: "/staff" },
  { label: "Invoice", kind: "job", jobPath: "/invoices" },
  { label: "Lead Activity", kind: "global", href: "/leads/activities" },
  { label: "Lead Opportunity", kind: "global", href: "/leads" },
  { label: "Lead Proposal", kind: "global", href: "/leads/proposals" },
  { label: "Message", kind: "job", jobPath: "/messages" },
  { label: "Purchase Order", kind: "job", jobPath: "/purchase-orders" },
  { label: "Receipt", kind: "job", jobPath: "/cost-inbox" },
  { label: "RFI", kind: "job", jobPath: "/rfis" },
  { label: "Schedule Item", kind: "job", jobPath: "/schedule" },
  { label: "Selection", kind: "job", jobPath: "/selections" },
  { label: "Specifications", kind: "job", jobPath: "/plans-and-specs" },
  { label: "Sub/Vendor", kind: "global", href: "/vendors" },
  { label: "Time Clock Shift", kind: "job", jobPath: "/time-clock" },
  { label: "Warranty Claim", kind: "job", jobPath: "/warranties" },
];

/**
 * The top bar's Help (?) menu — Buildertrend's own support surface (its community,
 * learning academy, and support chat are Buildertrend's SaaS resources, not
 * something WCI OS has an equivalent of). Shown for visual parity, same "real BT
 * item with nothing behind it yet" treatment as JOBS_NAV's "New Job From Template" —
 * not silently dropped, but inert until/unless a real destination exists for one.
 */
export const HELP_MENU_ITEMS: readonly string[] = [
  "Contact us",
  "Support Chat",
  "Community",
  "Buildertrend Learning Academy",
  "Help Center",
  "Product Feedback",
  "Legal",
];
