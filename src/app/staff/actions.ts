"use server";

import { revalidatePath } from "next/cache";

import { UserRole } from "@/generated/prisma/enums";
import { requireRole } from "@/lib/auth";
import { ASSIGNABLE_STAFF_ROLES } from "@/lib/staff/role-descriptions";
import { DuplicateStaffEmailError, inviteStaffMember } from "@/lib/staff/service";

export interface ActionState {
  readonly error?: string;
  readonly ok?: boolean;
  /** Soft post-create message. Not a hard failure. */
  readonly notice?: string;
}

function isAssignableRole(value: string): value is (typeof ASSIGNABLE_STAFF_ROLES)[number] {
  return (ASSIGNABLE_STAFF_ROLES as readonly string[]).includes(value);
}

/**
 * Save on the Internal Users form: create an inactive staff User (listed, not
 * invited). Send on the Login column activates + emails separately.
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
      isActive: false,
    });
  } catch (error) {
    if (error instanceof DuplicateStaffEmailError) return { error: error.message };
    throw error;
  }

  revalidatePath("/staff");

  return {
    ok: true,
    notice: "User saved to the list as Inactive. Use Send on their Login cell when you're ready to email invite instructions.",
  };
}
