"use server";

import { revalidatePath } from "next/cache";

import { Prisma } from "@/generated/prisma/client";
import { CostType } from "@/generated/prisma/enums";
import { requireAppUser } from "@/lib/auth";
import { db } from "@/lib/db";

export interface ActionState {
  readonly error?: string;
  readonly ok?: boolean;
}

export async function createCostCodeAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireAppUser();

  const code = String(formData.get("code") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const costTypeRaw = String(formData.get("defaultCostType") ?? CostType.NONE);

  if (!code || !name) {
    return { error: "Code and name are both required." };
  }
  if (!(costTypeRaw in CostType)) {
    return { error: "Choose a valid cost type." };
  }

  try {
    await db.costCode.create({
      data: {
        organizationId: user.organizationId,
        code,
        name,
        defaultCostType: costTypeRaw as CostType,
      },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { error: `Cost code "${code}" already exists.` };
    }
    throw error;
  }

  revalidatePath("/admin/cost-codes");
  return { ok: true };
}
