/**
 * Per-role site-module toggles (Settings → Role management). Rows in RoleSiteAccess
 * override the defaults below; missing rows mean "use DEFAULT_ROLE_SITE_ACCESS".
 *
 * Pure constants live in role-site-access-shared.ts (client-safe). This module
 * adds the DB-backed getters — import shared from client components, not this file.
 */

import { UserRole } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import {
  DEFAULT_ROLE_SITE_ACCESS,
  SITE_ACCESS_ROLES,
  defaultRoleSiteAccess,
  type RoleSiteAccessFlags,
  type SiteAccessRole,
} from "@/lib/staff/role-site-access-shared";

export {
  COMMISSION_COST_CODE,
  DEFAULT_ROLE_SITE_ACCESS,
  SITE_ACCESS_FLAG_KEYS,
  SITE_ACCESS_FLAG_LABELS,
  SITE_ACCESS_ROLES,
  canAccessCommissionMenu,
  defaultRoleSiteAccess,
  type RoleSiteAccessFlags,
  type SiteAccessRole,
} from "@/lib/staff/role-site-access-shared";

export async function getRoleSiteAccess(organizationId: string, role: UserRole): Promise<RoleSiteAccessFlags> {
  const defaults = defaultRoleSiteAccess(role);
  if (!(SITE_ACCESS_ROLES as readonly UserRole[]).includes(role)) return defaults;

  const row = await db.roleSiteAccess.findUnique({
    where: { organizationId_role: { organizationId, role } },
  });
  if (!row) return defaults;

  return {
    canAccessSales: row.canAccessSales,
    canAccessJobs: row.canAccessJobs,
    canAccessProjectManagement: row.canAccessProjectManagement,
    canAccessFiles: row.canAccessFiles,
    canAccessMessaging: row.canAccessMessaging,
    canAccessFinancials: row.canAccessFinancials,
    canAccessReports: row.canAccessReports,
    canAccessPeople: row.canAccessPeople,
    canAccessSettings: row.canAccessSettings,
  };
}

export async function listRoleSiteAccess(organizationId: string): Promise<Record<SiteAccessRole, RoleSiteAccessFlags>> {
  const rows = await db.roleSiteAccess.findMany({ where: { organizationId } });
  const byRole = new Map(rows.map((row) => [row.role, row]));
  const result = {} as Record<SiteAccessRole, RoleSiteAccessFlags>;
  for (const role of SITE_ACCESS_ROLES) {
    const row = byRole.get(role);
    result[role] = row
      ? {
          canAccessSales: row.canAccessSales,
          canAccessJobs: row.canAccessJobs,
          canAccessProjectManagement: row.canAccessProjectManagement,
          canAccessFiles: row.canAccessFiles,
          canAccessMessaging: row.canAccessMessaging,
          canAccessFinancials: row.canAccessFinancials,
          canAccessReports: row.canAccessReports,
          canAccessPeople: row.canAccessPeople,
          canAccessSettings: row.canAccessSettings,
        }
      : DEFAULT_ROLE_SITE_ACCESS[role];
  }
  return result;
}

export async function upsertRoleSiteAccess(
  organizationId: string,
  role: SiteAccessRole,
  flags: RoleSiteAccessFlags,
) {
  return db.roleSiteAccess.upsert({
    where: { organizationId_role: { organizationId, role } },
    create: { organizationId, role, ...flags },
    update: { ...flags },
  });
}

/**
 * Effective job-financials access for a staff user: per-user override when set,
 * otherwise the role's RoleSiteAccess / default (Sales Rep → false).
 */
export async function userCanAccessJobFinancials(user: {
  readonly organizationId: string;
  readonly role: UserRole;
  readonly canAccessJobFinancials: boolean | null;
}): Promise<boolean> {
  if (user.canAccessJobFinancials !== null && user.canAccessJobFinancials !== undefined) {
    return user.canAccessJobFinancials;
  }
  const access = await getRoleSiteAccess(user.organizationId, user.role);
  return access.canAccessFinancials;
}
