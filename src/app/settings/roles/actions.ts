"use server";

import { revalidatePath } from "next/cache";

import { UserRole } from "@/generated/prisma/enums";
import { requireRole } from "@/lib/auth";
import {
  SITE_ACCESS_FLAG_KEYS,
  SITE_ACCESS_ROLES,
  type RoleSiteAccessFlags,
  type SiteAccessRole,
  upsertRoleSiteAccess,
} from "@/lib/staff/role-site-access";

export interface RoleAccessActionState {
  readonly error?: string;
  readonly ok?: boolean;
}

function isSiteAccessRole(value: string): value is SiteAccessRole {
  return (SITE_ACCESS_ROLES as readonly string[]).includes(value);
}

/** Persist one role's site-access toggle matrix from Settings → Role management. */
export async function updateRoleSiteAccessAction(
  _previous: RoleAccessActionState,
  formData: FormData,
): Promise<RoleAccessActionState> {
  const admin = await requireRole(UserRole.ADMIN);

  const role = String(formData.get("role") ?? "");
  if (!isSiteAccessRole(role)) return { error: "Unknown role." };

  const flags = {} as Record<(typeof SITE_ACCESS_FLAG_KEYS)[number], boolean>;
  for (const key of SITE_ACCESS_FLAG_KEYS) {
    flags[key] = formData.get(key) === "on";
  }

  await upsertRoleSiteAccess(admin.organizationId, role, flags as RoleSiteAccessFlags);

  revalidatePath("/settings/roles");
  return { ok: true };
}
