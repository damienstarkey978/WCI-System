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

  const text = (key: string) => String(formData.get(key) ?? "").trim();
  const name = text("name");
  const email = text("email").toLowerCase();

  if (!name) return { error: "Name is required." };
  if (!email) return { error: "Email is required." };

  try {
    await createClient({
      organizationId: user.organizationId,
      name,
      email,
      phone: text("phone") || null,
      cellPhone: text("cellPhone") || null,
      addressLine1: text("addressLine1") || null,
      city: text("city") || null,
      state: text("state") || null,
      postalCode: text("postalCode") || null,
    });
  } catch (error) {
    if (error instanceof Error && /unique/i.test(error.message)) {
      return { error: `A client with email "${email}" already exists.` };
    }
    throw error;
  }

  revalidatePath("/clients");
  return { ok: true };
}
