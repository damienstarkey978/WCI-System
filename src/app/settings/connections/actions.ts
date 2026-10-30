"use server";

import { revalidatePath } from "next/cache";

import { UserRole } from "@/generated/prisma/enums";
import { currentAppUserOrRedirect } from "@/lib/auth";
import { disconnect } from "@/lib/oauth/connections";
import { OAuthError, setGrantActingApiKey } from "@/lib/oauth/service";

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

/**
 * Bind (or clear) which bot ApiKey this OAuth grant attributes as. Lets Damien point
 * the existing Cursor MCP connection at `heather` without reconnecting Cursor.
 */
export async function setConnectionActingApiKey(formData: FormData): Promise<void> {
  const user = await currentAppUserOrRedirect();
  const oauthClientId = String(formData.get("oauthClientId") ?? "");
  const ownerId = String(formData.get("userId") ?? "");
  const actingApiKeyId = String(formData.get("actingApiKeyId") ?? "").trim() || null;

  if (ownerId !== user.id && user.role !== UserRole.ADMIN) {
    throw new Error("Only an admin can change attribution for an application connected by someone else.");
  }

  try {
    await setGrantActingApiKey({
      organizationId: user.organizationId,
      oauthClientId,
      userId: ownerId,
      actingApiKeyId,
    });
  } catch (error) {
    if (error instanceof OAuthError) throw new Error(error.message);
    throw error;
  }

  revalidatePath("/settings/connections");
}
