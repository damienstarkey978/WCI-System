"use server";

import { revalidatePath } from "next/cache";

import { requireAppUser } from "@/lib/auth";
import {
  ClientNotFoundError,
  createWarrantyClaim,
  JobNotFoundError,
  scheduleAppointment,
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

  if (!claimNumber) return { error: "Claim number is required." };
  if (!title) return { error: "Title is required." };
  if (!description) return { error: "Description is required." };

  try {
    await createWarrantyClaim({
      organizationId: user.organizationId,
      jobId,
      claimNumber,
      title,
      description,
      clientId: clientId || null,
    });
  } catch (error) {
    if (error instanceof JobNotFoundError || error instanceof ClientNotFoundError) return { error: error.message };
    if (error instanceof Error && /unique/i.test(error.message)) {
      return { error: `Claim number "${claimNumber}" is already in use.` };
    }
    throw error;
  }

  revalidatePath(`/jobs/${jobId}/warranties`);
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
  return { ok: true };
}
