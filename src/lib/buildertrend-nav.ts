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

export const JOB_TOP_NAV: readonly JobNavLink[] = [
  { label: "Files", path: "/files" },
  { label: "Messaging", path: "/messages" },
  { label: "Financial", path: "/budget" },
];

export const REPORTS_HREF = "/reports";
