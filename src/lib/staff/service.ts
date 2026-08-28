/**
 * Staff account management. Nothing here sends an invitation email — WCI OS has no
 * outbound email integration anywhere in this codebase. "Inviting" a staff member
 * means pre-authorizing their email: create a User row with clerkUserId null, and
 * currentAppUser() (src/lib/auth.ts) links it to their real Clerk identity
 * automatically the first time they sign in with a matching email — the same
 * "wait for a matching email" mechanism every staff member in this app already
 * goes through, just now reachable without hand-editing the database.
 */

import { Prisma } from "@/generated/prisma/client";
import { ScheduleScope, UserRole } from "@/generated/prisma/enums";
import { db } from "@/lib/db";

export class DuplicateStaffEmailError extends Error {
  constructor(email: string) {
    super(`A staff member with email ${email} already exists in this organization.`);
    this.name = "DuplicateStaffEmailError";
  }
}

export class StaffMemberNotFoundError extends Error {
  constructor(userId: string) {
    super(`Staff member ${userId} not found`);
    this.name = "StaffMemberNotFoundError";
  }
}

export class StaffJobNotFoundError extends Error {
  constructor(jobId: string) {
    super(`Job ${jobId} not found`);
    this.name = "StaffJobNotFoundError";
  }
}

/** Blocks a change that would leave an organization with zero active admins. */
export class LastAdminError extends Error {
  constructor() {
    super("This organization must keep at least one active admin — this change would leave it with none.");
    this.name = "LastAdminError";
  }
}

export interface InviteStaffMemberInput {
  readonly organizationId: string;
  readonly email: string;
  readonly name?: string | null;
  readonly role: UserRole;
  /** Cosmetic display label (e.g. "Sales Rep", "Org Owner") — see the schema comment on User.title. */
  readonly title?: string | null;
  readonly phone?: string | null;
}

export async function inviteStaffMember(input: InviteStaffMemberInput) {
  const email = input.email.trim().toLowerCase();
  try {
    return await db.user.create({
      data: {
        organizationId: input.organizationId,
        email,
        name: input.name ?? null,
        role: input.role,
        title: input.title ?? null,
        phone: input.phone ?? null,
      },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new DuplicateStaffEmailError(email);
    }
    throw error;
  }
}

export async function listStaffMembers(organizationId: string) {
  return db.user.findMany({
    where: { organizationId },
    orderBy: [{ isActive: "desc" }, { email: "asc" }],
  });
}

export async function getStaffMember(organizationId: string, userId: string) {
  const user = await db.user.findFirst({ where: { id: userId, organizationId } });
  if (!user) throw new StaffMemberNotFoundError(userId);
  return user;
}

export interface UpdateStaffProfileInput {
  readonly title?: string | null;
  readonly phone?: string | null;
  readonly name?: string | null;
}

/** Updates cosmetic profile fields only — never touches role or isActive. */
export async function updateStaffProfile(organizationId: string, userId: string, input: UpdateStaffProfileInput) {
  const user = await db.user.findFirst({ where: { id: userId, organizationId } });
  if (!user) throw new StaffMemberNotFoundError(userId);

  return db.user.update({
    where: { id: user.id },
    data: {
      title: input.title !== undefined ? input.title : undefined,
      phone: input.phone !== undefined ? input.phone : undefined,
      name: input.name !== undefined ? input.name : undefined,
    },
  });
}

async function countOtherActiveAdmins(organizationId: string, excludingUserId: string): Promise<number> {
  return db.user.count({
    where: { organizationId, role: UserRole.ADMIN, isActive: true, id: { not: excludingUserId } },
  });
}

export async function updateStaffRole(organizationId: string, userId: string, role: UserRole) {
  const user = await db.user.findFirst({ where: { id: userId, organizationId } });
  if (!user) throw new StaffMemberNotFoundError(userId);

  if (user.role === UserRole.ADMIN && role !== UserRole.ADMIN && user.isActive) {
    const remaining = await countOtherActiveAdmins(organizationId, userId);
    if (remaining === 0) throw new LastAdminError();
  }

  return db.user.update({ where: { id: user.id }, data: { role } });
}

export async function setStaffActive(organizationId: string, userId: string, isActive: boolean) {
  const user = await db.user.findFirst({ where: { id: userId, organizationId } });
  if (!user) throw new StaffMemberNotFoundError(userId);

  if (!isActive && user.role === UserRole.ADMIN && user.isActive) {
    const remaining = await countOtherActiveAdmins(organizationId, userId);
    if (remaining === 0) throw new LastAdminError();
  }

  return db.user.update({ where: { id: user.id }, data: { isActive } });
}

/**
 * Job-level access grants (src/lib/job-access.ts). Only meaningful for FIELD —
 * ADMIN/PM/OFFICE already have org-wide visibility and ignore grants entirely
 * — but nothing here stops one from being created for another role; it would
 * just never be consulted.
 */
export interface GrantStaffJobAccessInput {
  readonly organizationId: string;
  readonly userId: string;
  readonly jobId: string;
  readonly scheduleScope: ScheduleScope;
  readonly canViewPricing: boolean;
  readonly canViewCostDetail: boolean;
  readonly canManageSchedule: boolean;
  readonly canApproveChangeOrders: boolean;
  readonly canViewDocuments: boolean;
  readonly canCommunicateWithClient: boolean;
}

export async function grantStaffJobAccess(input: GrantStaffJobAccessInput) {
  const [user, job] = await Promise.all([
    db.user.findFirst({ where: { id: input.userId, organizationId: input.organizationId }, select: { id: true } }),
    db.job.findFirst({ where: { id: input.jobId, organizationId: input.organizationId }, select: { id: true } }),
  ]);
  if (!user) throw new StaffMemberNotFoundError(input.userId);
  if (!job) throw new StaffJobNotFoundError(input.jobId);

  const flags = {
    scheduleScope: input.scheduleScope,
    canViewPricing: input.canViewPricing,
    canViewCostDetail: input.canViewCostDetail,
    canManageSchedule: input.canManageSchedule,
    canApproveChangeOrders: input.canApproveChangeOrders,
    canViewDocuments: input.canViewDocuments,
    canCommunicateWithClient: input.canCommunicateWithClient,
  };

  return db.jobAccessGrant.upsert({
    where: { jobId_userId: { jobId: input.jobId, userId: input.userId } },
    create: { jobId: input.jobId, userId: input.userId, ...flags },
    update: flags,
  });
}

/** Idempotent — revoking a grant that's already gone is a no-op, not an error. */
export async function revokeStaffJobAccess(organizationId: string, userId: string, jobId: string): Promise<void> {
  await db.jobAccessGrant.deleteMany({ where: { jobId, userId, job: { organizationId } } });
}
