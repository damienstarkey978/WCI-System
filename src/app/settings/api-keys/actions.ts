"use server";

import { revalidatePath } from "next/cache";

import { UserRole } from "@/generated/prisma/enums";
import { createApiKey, revokeApiKey } from "@/lib/api-keys/service";
import { SCOPES } from "@/lib/api-scopes";
import { requireRole } from "@/lib/auth";

export interface CreateKeyState {
  readonly error?: string;
  readonly token?: string;
  readonly name?: string;
}

export async function createApiKeyAction(_previous: CreateKeyState, formData: FormData): Promise<CreateKeyState> {
  const admin = await requireRole(UserRole.ADMIN);

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "Name is required." };

  const scopes = formData.getAll("scopes").map(String);
  if (scopes.length === 0) return { error: "Select at least one scope." };
  const invalid = scopes.filter((scope) => !(SCOPES as readonly string[]).includes(scope));
  if (invalid.length > 0) return { error: `Unknown scope(s): ${invalid.join(", ")}` };

  const expiresInDays = String(formData.get("expiresInDays") ?? "").trim();
  const expiresAt = expiresInDays ? new Date(Date.now() + Number(expiresInDays) * 86_400_000) : null;

  try {
    const created = await createApiKey(admin.organizationId, {
      name,
      scopes,
      expiresAt,
      createdByUserId: admin.id,
    });
    revalidatePath("/settings/api-keys");
    return { token: created.token, name };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Failed to create API key." };
  }
}

export async function revokeApiKeyAction(apiKeyId: string): Promise<void> {
  const admin = await requireRole(UserRole.ADMIN);
  await revokeApiKey(admin.organizationId, apiKeyId);
  revalidatePath("/settings/api-keys");
}
