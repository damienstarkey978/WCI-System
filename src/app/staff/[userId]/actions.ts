"use server";

import { revalidatePath } from "next/cache";

import { ScheduleScope, UserRole } from "@/generated/prisma/enums";
import { requireRole } from "@/lib/auth";
import { ASSIGNABLE_STAFF_ROLES } from "@/lib/staff/role-descriptions";
import {
  grantStaffJobAccess,
  LastAdminError,
  revokeStaffJobAccess,
  setStaffActive,
  StaffJobNotFoundError,
  StaffMemberNotFoundError,
  updateStaffProfile,
  updateStaffRole,
} from "@/lib/staff/service";

export interface ActionState {
  readonly error?: string;
  readonly ok?: boolean;
}

function isAssignableRole(value: string): value is (typeof ASSIGNABLE_STAFF_ROLES)[number] {
  return (ASSIGNABLE_STAFF_ROLES as readonly string[]).includes(value);
}

export async function updateStaffRoleAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const admin = await requireRole(UserRole.ADMIN);

  const userId = String(formData.get("userId") ?? "");
  const role = String(formData.get("role") ?? "");
  if (!isAssignableRole(role)) return { error: "Choose a role." };

  try {
    await updateStaffRole(admin.organizationId, userId, role);
  } catch (error) {
    if (error instanceof LastAdminError || error instanceof StaffMemberNotFoundError) return { error: error.message };
    throw error;
  }

  revalidatePath(`/staff/${userId}`);
  revalidatePath("/staff");
  return { ok: true };
}

export async function setStaffActiveAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const admin = await requireRole(UserRole.ADMIN);

  const userId = String(formData.get("userId") ?? "");
  const isActive = String(formData.get("isActive") ?? "") === "true";

  try {
    await setStaffActive(admin.organizationId, userId, isActive);
  } catch (error) {
    if (error instanceof LastAdminError || error instanceof StaffMemberNotFoundError) return { error: error.message };
    throw error;
  }

  revalidatePath(`/staff/${userId}`);
  revalidatePath("/staff");
  return { ok: true };
}

export async function updateStaffProfileAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const admin = await requireRole(UserRole.ADMIN);

  const userId = String(formData.get("userId") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const title = String(formData.get("title") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();

  try {
    await updateStaffProfile(admin.organizationId, userId, { name: name || null, title: title || null, phone: phone || null });
  } catch (error) {
    if (error instanceof StaffMemberNotFoundError) return { error: error.message };
    throw error;
  }

  revalidatePath(`/staff/${userId}`);
  revalidatePath("/staff");
  return { ok: true };
}

export async function grantJobAccessAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const admin = await requireRole(UserRole.ADMIN);

  const userId = String(formData.get("userId") ?? "");
  const jobId = String(formData.get("jobId") ?? "");
  if (!jobId) return { error: "Choose a job." };

  const scheduleScope = String(formData.get("scheduleScope") ?? "ASSIGNED_ONLY") === "ALL_ITEMS" ? ScheduleScope.ALL_ITEMS : ScheduleScope.ASSIGNED_ONLY;

  try {
    await grantStaffJobAccess({
      organizationId: admin.organizationId,
      userId,
      jobId,
      scheduleScope,
      canViewPricing: formData.get("canViewPricing") === "on",
      canViewCostDetail: formData.get("canViewCostDetail") === "on",
      canManageSchedule: formData.get("canManageSchedule") === "on",
      canApproveChangeOrders: formData.get("canApproveChangeOrders") === "on",
      canViewDocuments: formData.get("canViewDocuments") === "on",
      canCommunicateWithClient: formData.get("canCommunicateWithClient") === "on",
    });
  } catch (error) {
    if (error instanceof StaffMemberNotFoundError || error instanceof StaffJobNotFoundError) return { error: error.message };
    throw error;
  }

  revalidatePath(`/staff/${userId}`);
  return { ok: true };
}

export async function revokeJobAccessAction(formData: FormData): Promise<void> {
  const admin = await requireRole(UserRole.ADMIN);

  const userId = String(formData.get("userId") ?? "");
  const jobId = String(formData.get("jobId") ?? "");

  await revokeStaffJobAccess(admin.organizationId, userId, jobId);

  revalidatePath(`/staff/${userId}`);
}
