"use server";

import { revalidatePath } from "next/cache";

import { UserRole } from "@/generated/prisma/enums";
import { appBaseUrl } from "@/lib/app-url";
import { requireRole } from "@/lib/auth";
import { isTransactionalEmailConfigured } from "@/lib/env";
import { emailStaffSignInInstructions } from "@/lib/staff/invite-email";
import { ASSIGNABLE_STAFF_ROLES } from "@/lib/staff/role-descriptions";
import { DuplicateStaffEmailError, inviteStaffMember } from "@/lib/staff/service";

export interface ActionState {
  readonly error?: string;
  readonly ok?: boolean;
  /** Soft post-create message (invite emailed / hand the sign-in URL). Not a hard failure. */
  readonly notice?: string;
  readonly emailed?: boolean;
  readonly signInUrl?: string;
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

  let member;
  try {
    member = await inviteStaffMember({
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

  // Best-effort invite email after the User row exists. Create still succeeds if
  // Resend isn't configured or the send fails — admin can resend from the profile.
  const invite = await emailStaffSignInInstructions(user.organizationId, member.id, await appBaseUrl());
  const notice = invite.emailed
    ? `User added. Sign-in instructions emailed to ${invite.email}.`
    : isTransactionalEmailConfigured()
      ? `User added, but the invite email didn't send${invite.emailError ? ` (${invite.emailError})` : ""}. Open their profile to resend or copy the sign-in link.`
      : `User added. Email isn't configured — tell them to sign in at ${invite.signInUrl} with ${invite.email}.`;

  return {
    ok: true,
    emailed: invite.emailed,
    signInUrl: invite.signInUrl,
    notice,
  };
}
