"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/client-portal/service";
import { requireAppUser } from "@/lib/auth";

export interface ActionState {
  readonly error?: string;
  readonly ok?: boolean;
}

export async function createClientAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireAppUser();

  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();

  if (!name) return { error: "Name is required." };
  if (!email) return { error: "Email is required." };

  try {
    await createClient({ organizationId: user.organizationId, name, email, phone: phone || null });
  } catch (error) {
    if (error instanceof Error && /unique/i.test(error.message)) {
      return { error: `A client with email "${email}" already exists.` };
    }
    throw error;
  }

  revalidatePath("/clients");
  return { ok: true };
}
