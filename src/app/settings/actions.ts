"use server";

import { revalidatePath } from "next/cache";

import { requireAppUser } from "@/lib/auth";
import { StaffMemberNotFoundError, updateStaffProfile } from "@/lib/staff/service";

export interface ActionState {
  readonly error?: string;
  readonly ok?: boolean;
}

/**
 * The self-service counterpart to /staff/[userId]'s admin-only updateStaffProfileAction
 * — same underlying updateStaffProfile(), but scoped to the signed-in user's own row
 * (from the session, never a client-supplied id) so any staff member can edit their
 * own display name/title/phone without needing admin rights.
 */
export async function updateMyProfileAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireAppUser();

  const name = String(formData.get("name") ?? "").trim();
  const title = String(formData.get("title") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();

  try {
    await updateStaffProfile(user.organizationId, user.id, { name: name || null, title: title || null, phone: phone || null });
  } catch (error) {
    if (error instanceof StaffMemberNotFoundError) return { error: error.message };
    throw error;
  }

  revalidatePath("/settings");
  return { ok: true };
}
