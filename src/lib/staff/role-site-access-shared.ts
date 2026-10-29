/**
 * Pure Sales Rep / role site-access constants — safe for client components.
 * DB-backed getters live in role-site-access.ts (server-only).
 */

import { UserRole } from "@/generated/prisma/enums";

export interface RoleSiteAccessFlags {
  readonly canAccessSales: boolean;
  readonly canAccessJobs: boolean;
  readonly canAccessProjectManagement: boolean;
  readonly canAccessFiles: boolean;
  readonly canAccessMessaging: boolean;
  readonly canAccessFinancials: boolean;
  readonly canAccessReports: boolean;
  readonly canAccessPeople: boolean;
  readonly canAccessSettings: boolean;
}

const FULL: RoleSiteAccessFlags = {
  canAccessSales: true,
  canAccessJobs: true,
  canAccessProjectManagement: true,
  canAccessFiles: true,
  canAccessMessaging: true,
  canAccessFinancials: true,
  canAccessReports: true,
  canAccessPeople: true,
  canAccessSettings: true,
};

const OFFICE_LIKE: RoleSiteAccessFlags = {
  ...FULL,
  canAccessSettings: false,
};

/** Human-assignable roles that appear on the Role management matrix. */
export const SITE_ACCESS_ROLES = [
  UserRole.ADMIN,
  UserRole.PM,
  UserRole.OFFICE,
  UserRole.FIELD,
  UserRole.SALES_REP,
] as const;

export type SiteAccessRole = (typeof SITE_ACCESS_ROLES)[number];

export const DEFAULT_ROLE_SITE_ACCESS: Record<SiteAccessRole, RoleSiteAccessFlags> = {
  [UserRole.ADMIN]: FULL,
  [UserRole.PM]: OFFICE_LIKE,
  [UserRole.OFFICE]: OFFICE_LIKE,
  [UserRole.FIELD]: {
    canAccessSales: false,
    canAccessJobs: true,
    canAccessProjectManagement: true,
    canAccessFiles: true,
    canAccessMessaging: true,
    canAccessFinancials: false,
    canAccessReports: false,
    canAccessPeople: false,
    canAccessSettings: false,
  },
  [UserRole.SALES_REP]: {
    canAccessSales: true,
    canAccessJobs: true,
    canAccessProjectManagement: true,
    canAccessFiles: true,
    canAccessMessaging: true,
    /** Damien 2026-10-29: Sales Rep job financials OFF by default. */
    canAccessFinancials: false,
    canAccessReports: false,
    canAccessPeople: true,
    canAccessSettings: false,
  },
};

export const SITE_ACCESS_FLAG_KEYS = [
  "canAccessSales",
  "canAccessJobs",
  "canAccessProjectManagement",
  "canAccessFiles",
  "canAccessMessaging",
  "canAccessFinancials",
  "canAccessReports",
  "canAccessPeople",
  "canAccessSettings",
] as const satisfies readonly (keyof RoleSiteAccessFlags)[];

export const SITE_ACCESS_FLAG_LABELS: Record<(typeof SITE_ACCESS_FLAG_KEYS)[number], string> = {
  canAccessSales: "Sales",
  canAccessJobs: "Jobs",
  canAccessProjectManagement: "Project Management",
  canAccessFiles: "Files",
  canAccessMessaging: "Messaging",
  canAccessFinancials: "Job financials",
  canAccessReports: "Reports",
  canAccessPeople: "People",
  canAccessSettings: "Settings",
};

function isSiteAccessRole(role: UserRole): role is SiteAccessRole {
  return (SITE_ACCESS_ROLES as readonly UserRole[]).includes(role);
}

export function defaultRoleSiteAccess(role: UserRole): RoleSiteAccessFlags {
  if (isSiteAccessRole(role)) return DEFAULT_ROLE_SITE_ACCESS[role];
  // AGENT: machine keys — no staff nav; deny everything at the shell layer.
  return {
    canAccessSales: false,
    canAccessJobs: false,
    canAccessProjectManagement: false,
    canAccessFiles: false,
    canAccessMessaging: false,
    canAccessFinancials: false,
    canAccessReports: false,
    canAccessPeople: false,
    canAccessSettings: false,
  };
}

/** Sales Reps always keep Financial → Commission even when job financials are off. */
export function canAccessCommissionMenu(role: UserRole): boolean {
  return role === UserRole.SALES_REP;
}

export const COMMISSION_COST_CODE = "01-COMMISSION";
