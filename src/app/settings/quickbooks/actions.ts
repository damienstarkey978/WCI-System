"use server";

import { revalidatePath } from "next/cache";

import { UserRole } from "@/generated/prisma/enums";
import { requireRole } from "@/lib/auth";
import { disconnectConnection } from "@/lib/quickbooks/connection-service";

export async function disconnectQuickBooksAction(): Promise<void> {
  const user = await requireRole(UserRole.ADMIN);
  await disconnectConnection(user.organizationId);
  revalidatePath("/settings/quickbooks");
}
