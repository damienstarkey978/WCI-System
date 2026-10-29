/**
 * What a staff user (User) can see/do on one job — the (User x Job) grant layer
 * named in CLAUDE.md 2.4. Distinct from VendorJobAccess/ClientJobAccess, which
 * gate the vendor/client portals; this one gates the staff app itself
 * (src/app/jobs/[jobId]/layout.tsx enforces it for every nested job page).
 *
 * ADMIN, PM, and OFFICE have org-wide visibility by design — they run or
 * support jobs across the company, not just the ones they're explicitly
 * assigned to. JobAccessGrant exists to extend the narrower FIELD default to
 * specific jobs with specific capabilities, not to restrict the broader roles.
 *
 * SALES_REP sees only jobs where they are Job.salespersonUserId (the lead
 * assignee copied on Lead→Job conversion). They get job access without a
 * JobAccessGrant; financial depth is gated separately via role site access /
 * User.canAccessJobFinancials (Commission remains available either way).
 */

import { UserRole } from "@/generated/prisma/enums";
import { db } from "@/lib/db";

/** Roles that see every job without a JobAccessGrant (CLAUDE.md 2.4 / Buildertrend Admin+office model). */
export const ORG_WIDE_JOB_ACCESS_ROLES: readonly UserRole[] = [UserRole.ADMIN, UserRole.PM, UserRole.OFFICE];

export function hasOrgWideJobAccess(role: UserRole): boolean {
  return ORG_WIDE_JOB_ACCESS_ROLES.includes(role);
}

export interface JobAccessLevel {
  readonly allowed: boolean;
  readonly canViewPricing: boolean;
  readonly canViewCostDetail: boolean;
  readonly canManageSchedule: boolean;
  readonly canApproveChangeOrders: boolean;
  readonly canViewDocuments: boolean;
  readonly canCommunicateWithClient: boolean;
}

const FULL_ACCESS: JobAccessLevel = {
  allowed: true,
  canViewPricing: true,
  canViewCostDetail: true,
  canManageSchedule: true,
  canApproveChangeOrders: true,
  canViewDocuments: true,
  canCommunicateWithClient: true,
};

const SALES_REP_JOB_ACCESS: JobAccessLevel = {
  allowed: true,
  canViewPricing: false,
  canViewCostDetail: false,
  canManageSchedule: false,
  canApproveChangeOrders: false,
  canViewDocuments: true,
  canCommunicateWithClient: true,
};

const NO_ACCESS: JobAccessLevel = {
  allowed: false,
  canViewPricing: false,
  canViewCostDetail: false,
  canManageSchedule: false,
  canApproveChangeOrders: false,
  canViewDocuments: false,
  canCommunicateWithClient: false,
};

export async function getJobAccessLevel(user: { readonly id: string; readonly role: UserRole }, jobId: string): Promise<JobAccessLevel> {
  if (hasOrgWideJobAccess(user.role)) {
    return FULL_ACCESS;
  }
  // AGENT users authenticate via ApiKey (src/lib/api-auth.ts), never through this
  // Clerk-session path — reaching here at all would mean something is wrong, so
  // deny rather than guess.
  if (user.role === UserRole.AGENT) return NO_ACCESS;

  if (user.role === UserRole.SALES_REP) {
    const job = await db.job.findFirst({
      where: { id: jobId, salespersonUserId: user.id },
      select: { id: true },
    });
    return job ? SALES_REP_JOB_ACCESS : NO_ACCESS;
  }

  const grant = await db.jobAccessGrant.findUnique({ where: { jobId_userId: { jobId, userId: user.id } } });
  if (!grant) return NO_ACCESS;

  return {
    allowed: true,
    canViewPricing: grant.canViewPricing,
    canViewCostDetail: grant.canViewCostDetail,
    canManageSchedule: grant.canManageSchedule,
    canApproveChangeOrders: grant.canApproveChangeOrders,
    canViewDocuments: grant.canViewDocuments,
    canCommunicateWithClient: grant.canCommunicateWithClient,
  };
}
