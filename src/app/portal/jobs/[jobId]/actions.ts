"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { approveChangeOrder } from "@/lib/change-orders/service";
import { currentPortalSession } from "@/lib/client-portal/browser-session";
import { ModuleNotVisibleError, NoJobAccessError, requireClientJobAccess } from "@/lib/client-portal/auth";
import { db } from "@/lib/db";
import { approveSelectionOption } from "@/lib/selections/service";

export interface ActionState {
  readonly error?: string;
  readonly ok?: boolean;
}

async function requireSession(jobId: string, flag: "canApproveChangeOrders" | "canApproveSelections") {
  const session = await currentPortalSession();
  if (!session) redirect("/portal");
  await requireClientJobAccess(session.clientId, jobId, flag);
  return session;
}

export async function approveChangeOrderAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const jobId = String(formData.get("jobId") ?? "");
  const changeOrderId = String(formData.get("changeOrderId") ?? "");

  try {
    const session = await requireSession(jobId, "canApproveChangeOrders");
    const client = await db.client.findUnique({ where: { id: session.clientId }, select: { name: true } });
    await approveChangeOrder({
      organizationId: session.organizationId,
      changeOrderId,
      clientSignatureName: client?.name,
    });
  } catch (error) {
    if (error instanceof NoJobAccessError || error instanceof ModuleNotVisibleError) {
      return { error: "You don't have permission to approve change orders on this job." };
    }
    if (error instanceof Error) return { error: error.message };
    throw error;
  }

  revalidatePath(`/portal/jobs/${jobId}`);
  return { ok: true };
}

export async function approveSelectionOptionAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const jobId = String(formData.get("jobId") ?? "");
  const selectionId = String(formData.get("selectionId") ?? "");
  const optionId = String(formData.get("optionId") ?? "");

  try {
    const session = await requireSession(jobId, "canApproveSelections");
    await approveSelectionOption({ organizationId: session.organizationId, selectionId, optionId });
  } catch (error) {
    if (error instanceof NoJobAccessError || error instanceof ModuleNotVisibleError) {
      return { error: "You don't have permission to approve selections on this job." };
    }
    if (error instanceof Error) return { error: error.message };
    throw error;
  }

  revalidatePath(`/portal/jobs/${jobId}`);
  return { ok: true };
}
