"use server";

import { revalidatePath } from "next/cache";

import { UserRole } from "@/generated/prisma/enums";
import { requireRole } from "@/lib/auth";
import { updateOrganizationInfo } from "@/lib/organization/service";

export interface ActionState {
  readonly error?: string;
  readonly ok?: boolean;
}

export async function updateCompanyInfoAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const admin = await requireRole(UserRole.ADMIN);

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "Company name is required." };

  await updateOrganizationInfo(admin.organizationId, {
    name,
    logoPath: String(formData.get("logoPath") ?? "").trim() || null,
    addressLine1: String(formData.get("addressLine1") ?? "").trim() || null,
    city: String(formData.get("city") ?? "").trim() || null,
    state: String(formData.get("state") ?? "").trim() || null,
    postalCode: String(formData.get("postalCode") ?? "").trim() || null,
    contactEmail: String(formData.get("contactEmail") ?? "").trim() || null,
    contactPhone: String(formData.get("contactPhone") ?? "").trim() || null,
  });

  revalidatePath("/settings/company");
  return { ok: true };
}
