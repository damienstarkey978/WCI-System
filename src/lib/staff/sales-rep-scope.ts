/**
 * Query scoping for UserRole.SALES_REP: only their assigned leads / activities
 * and jobs where they are the salesperson. Other roles are unaffected (empty
 * filter additions).
 */

import type { Prisma } from "@/generated/prisma/client";
import { UserRole } from "@/generated/prisma/enums";

export function isSalesRepRole(role: UserRole): boolean {
  return role === UserRole.SALES_REP;
}

/** Prisma `where` fragment for Lead lists — AND with organizationId at the call site. */
export function salesRepLeadWhere(user: { readonly id: string; readonly role: UserRole }): Prisma.LeadWhereInput {
  if (!isSalesRepRole(user.role)) return {};
  return { assignedUserId: user.id };
}

/** Prisma `where` fragment for LeadActivity lists (via the parent Lead assignee). */
export function salesRepLeadActivityWhere(user: {
  readonly id: string;
  readonly role: UserRole;
}): Prisma.LeadActivityWhereInput {
  if (!isSalesRepRole(user.role)) return {};
  return { lead: { assignedUserId: user.id } };
}

/** Prisma `where` fragment for Job lists / sidebar. */
export function salesRepJobWhere(user: { readonly id: string; readonly role: UserRole }): Prisma.JobWhereInput {
  if (!isSalesRepRole(user.role)) return {};
  return { salespersonUserId: user.id };
}
