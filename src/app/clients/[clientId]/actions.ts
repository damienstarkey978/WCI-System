"use server";

import { revalidatePath } from "next/cache";

import { ClientNotFoundError as InviteClientNotFoundError, issuePortalLoginInvite } from "@/lib/client-portal/auth";
import { ClientNotFoundError, grantJobAccess, JobNotFoundError } from "@/lib/client-portal/service";
import { requireAppUser } from "@/lib/auth";

export interface ActionState {
  readonly error?: string;
  readonly ok?: boolean;
  readonly inviteToken?: string;
}

export async function grantClientJobAccessAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireAppUser();

  const clientId = String(formData.get("clientId") ?? "");
  const jobId = String(formData.get("jobId") ?? "");

  if (!jobId) return { error: "Choose a job." };

  try {
    await grantJobAccess({
      organizationId: user.organizationId,
      clientId,
      jobId,
      canViewDailyLogs: formData.get("canViewDailyLogs") === "on",
      canViewSchedule: formData.get("canViewSchedule") === "on",
      canViewDocuments: formData.get("canViewDocuments") === "on",
      canViewBudget: formData.get("canViewBudget") === "on",
      canViewInvoices: formData.get("canViewInvoices") === "on",
      canMakePayments: formData.get("canMakePayments") === "on",
      canViewSelections: formData.get("canViewSelections") === "on",
      canApproveSelections: formData.get("canApproveSelections") === "on",
      canViewChangeOrders: formData.get("canViewChangeOrders") === "on",
      canApproveChangeOrders: formData.get("canApproveChangeOrders") === "on",
    });
  } catch (error) {
    if (error instanceof ClientNotFoundError || error instanceof JobNotFoundError) return { error: error.message };
    throw error;
  }

  revalidatePath(`/clients/${clientId}`);
  return { ok: true };
}

export async function issueClientPortalInviteAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireAppUser();

  const clientId = String(formData.get("clientId") ?? "");

  try {
    const { token } = await issuePortalLoginInvite(user.organizationId, clientId);
    revalidatePath(`/clients/${clientId}`);
    return { ok: true, inviteToken: token };
  } catch (error) {
    if (error instanceof InviteClientNotFoundError) return { error: error.message };
    throw error;
  }
}
