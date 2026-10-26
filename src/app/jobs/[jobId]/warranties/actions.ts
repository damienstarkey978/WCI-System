"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireAppUser } from "@/lib/auth";
import { parseDollarsToCents } from "@/lib/money";
import {
  ClientNotFoundError,
  createWarrantyClaim,
  JobNotFoundError,
  scheduleAppointment,
  updateWarrantyClaim,
  VendorNotFoundError,
  WarrantyClaimNotFoundError,
} from "@/lib/warranty/service";

export interface ActionState {
  readonly error?: string;
  readonly ok?: boolean;
}

export async function createWarrantyClaimAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireAppUser();

  const jobId = String(formData.get("jobId") ?? "");
  const claimNumber = String(formData.get("claimNumber") ?? "").trim();
  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const clientId = String(formData.get("clientId") ?? "");
  const addedCostRaw = String(formData.get("addedCost") ?? "").trim();
  const followUpRaw = String(formData.get("followUpDate") ?? "");

  if (!title) return { error: "Title is required." };
  if (!description) return { error: "Problem description is required." };

  try {
    const claim = await createWarrantyClaim({
      organizationId: user.organizationId,
      jobId,
      claimNumber: claimNumber || null,
      title,
      description,
      clientId: clientId || null,
      category: String(formData.get("category") ?? "").trim() || null,
      priority: String(formData.get("priority") ?? "Low").trim() || "Low",
      classification: String(formData.get("classification") ?? "").trim() || null,
      internalNotes: String(formData.get("internalNotes") ?? "").trim() || null,
      addedCostCents: addedCostRaw ? parseDollarsToCents(addedCostRaw) : 0,
      showClient: formData.get("showClient") === "on",
      followUpDate: followUpRaw ? new Date(`${followUpRaw}T00:00:00Z`) : null,
    });
    revalidatePath(`/jobs/${jobId}/warranties`);
    redirect(`/jobs/${jobId}/warranties/${claim.id}`);
  } catch (error) {
    if (error instanceof JobNotFoundError || error instanceof ClientNotFoundError) return { error: error.message };
    if (error instanceof Error && error.message.includes("Cannot parse")) return { error: error.message };
    if (error instanceof Error && /unique/i.test(error.message)) {
      return { error: `Claim number "${claimNumber}" is already in use.` };
    }
    throw error;
  }
}

export async function updateWarrantyClaimAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireAppUser();
  const jobId = String(formData.get("jobId") ?? "");
  const claimId = String(formData.get("claimId") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const addedCostRaw = String(formData.get("addedCost") ?? "").trim();
  const followUpRaw = String(formData.get("followUpDate") ?? "");

  if (!title) return { error: "Title is required." };
  if (!description) return { error: "Problem description is required." };

  try {
    await updateWarrantyClaim({
      organizationId: user.organizationId,
      claimId,
      title,
      description,
      category: String(formData.get("category") ?? "").trim() || null,
      priority: String(formData.get("priority") ?? "Low").trim() || "Low",
      classification: String(formData.get("classification") ?? "").trim() || null,
      internalNotes: String(formData.get("internalNotes") ?? "").trim() || null,
      addedCostCents: addedCostRaw ? parseDollarsToCents(addedCostRaw) : 0,
      showClient: formData.get("showClient") === "on",
      followUpDate: followUpRaw ? new Date(`${followUpRaw}T00:00:00Z`) : null,
      clientId: String(formData.get("clientId") ?? "") || null,
    });
  } catch (error) {
    if (error instanceof WarrantyClaimNotFoundError || error instanceof ClientNotFoundError) {
      return { error: error.message };
    }
    if (error instanceof Error && error.message.includes("Cannot parse")) return { error: error.message };
    throw error;
  }

  revalidatePath(`/jobs/${jobId}/warranties`);
  revalidatePath(`/jobs/${jobId}/warranties/${claimId}`);
  return { ok: true };
}

export async function scheduleWarrantyAppointmentAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireAppUser();

  const jobId = String(formData.get("jobId") ?? "");
  const claimId = String(formData.get("claimId") ?? "");
  const appointmentAtRaw = String(formData.get("appointmentAt") ?? "");
  const assignedVendorId = String(formData.get("assignedVendorId") ?? "");

  if (!appointmentAtRaw) return { error: "Appointment date is required." };

  try {
    await scheduleAppointment({
      organizationId: user.organizationId,
      claimId,
      appointmentAt: new Date(appointmentAtRaw),
      assignedVendorId: assignedVendorId || null,
    });
  } catch (error) {
    if (error instanceof WarrantyClaimNotFoundError || error instanceof VendorNotFoundError) return { error: error.message };
    throw error;
  }

  revalidatePath(`/jobs/${jobId}/warranties`);
  revalidatePath(`/jobs/${jobId}/warranties/${claimId}`);
  return { ok: true };
}
