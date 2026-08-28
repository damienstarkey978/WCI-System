"use server";

import { revalidatePath } from "next/cache";

import { UserRole } from "@/generated/prisma/enums";
import { requireRole } from "@/lib/auth";
import { ASSIGNABLE_STAFF_ROLES } from "@/lib/staff/role-descriptions";
import { DuplicateStaffEmailError, inviteStaffMember } from "@/lib/staff/service";

export interface ActionState {
  readonly error?: string;
  readonly ok?: boolean;
}

function isAssignableRole(value: string): value is (typeof ASSIGNABLE_STAFF_ROLES)[number] {
  return (ASSIGNABLE_STAFF_ROLES as readonly string[]).includes(value);
}

/**
 * Only an admin reaches this — the /staff page itself is gated to ADMIN, and this
 * is a direct human action through an explicit admin-only screen, so (unlike
 * Jarvis's tool loop) it performs the invite immediately rather than queuing a
 * pending action.
 */
export async function inviteStaffAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireRole(UserRole.ADMIN);

  const email = String(formData.get("email") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const title = String(formData.get("title") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const role = String(formData.get("role") ?? "");

  if (!email) return { error: "Email is required." };
  if (!isAssignableRole(role)) return { error: "Choose a role." };

  try {
    await inviteStaffMember({
      organizationId: user.organizationId,
      email,
      name: name || null,
      title: title || null,
      phone: phone || null,
      role,
    });
  } catch (error) {
    if (error instanceof DuplicateStaffEmailError) return { error: error.message };
    throw error;
  }

  revalidatePath("/staff");
  return { ok: true };
}
