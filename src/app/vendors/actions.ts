"use server";

import { revalidatePath } from "next/cache";

import { requireAppUser } from "@/lib/auth";
import { createVendor } from "@/lib/vendor-portal/service";

export interface ActionState {
  readonly error?: string;
  readonly ok?: boolean;
}

export async function createVendorAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireAppUser();

  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const tradeType = String(formData.get("tradeType") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();

  if (!name) return { error: "Name is required." };
  if (!email) return { error: "Email is required." };

  try {
    await createVendor({
      organizationId: user.organizationId,
      name,
      email,
      tradeType: tradeType || null,
      phone: phone || null,
    });
  } catch (error) {
    if (error instanceof Error && /unique/i.test(error.message)) {
      return { error: `A vendor with email "${email}" already exists.` };
    }
    throw error;
  }

  revalidatePath("/vendors");
  return { ok: true };
}
