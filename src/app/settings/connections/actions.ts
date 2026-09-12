"use server";

import { revalidatePath } from "next/cache";

import { UserRole } from "@/generated/prisma/enums";
import { currentAppUserOrRedirect } from "@/lib/auth";
import { disconnect } from "@/lib/oauth/connections";

/**
 * Anyone can cut off their own connection; an admin can cut off anyone's. Both matter:
 * the first is the promise the consent screen makes, and the second is what you need
 * on the day someone leaves and nobody can sign in as them to tidy up.
 */
export async function disconnectApplication(formData: FormData): Promise<void> {
  const user = await currentAppUserOrRedirect();
  const oauthClientId = String(formData.get("oauthClientId") ?? "");
  const ownerId = String(formData.get("userId") ?? "");

  if (ownerId !== user.id && user.role !== UserRole.ADMIN) {
    throw new Error("Only an admin can disconnect an application connected by someone else.");
  }

  await disconnect(user.organizationId, oauthClientId, ownerId);
  revalidatePath("/settings/connections");
}
