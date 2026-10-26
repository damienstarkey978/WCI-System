"use server";

import { revalidatePath } from "next/cache";

import { requireAppUser } from "@/lib/auth";
import { EmailNotConfiguredError, EmailSendError } from "@/lib/email/send";
import {
  assignPermitVendor,
  JobNotFoundError,
  NoVendorEmailError,
  PermitNotFoundError,
  sendPermitReminder,
  setInspectionCompleted,
  setJobNocNtbo,
  setPermitPulled,
} from "@/lib/permitting/service";

export interface ActionState {
  readonly error?: string;
  readonly ok?: boolean;
  readonly emailedTo?: string;
}

function revalidate(jobId: string) {
  revalidatePath(`/jobs/${jobId}/permitting`);
}

export async function setPermitPulledAction(formData: FormData): Promise<void> {
  const user = await requireAppUser();
  const jobId = String(formData.get("jobId") ?? "");
  const permitId = String(formData.get("permitId") ?? "");
  const pulled = formData.get("pulled") === "true";
  try {
    await setPermitPulled(user.organizationId, permitId, pulled);
  } catch {
    // Refresh either way.
  }
  revalidate(jobId);
}

export async function setInspectionCompletedAction(formData: FormData): Promise<void> {
  const user = await requireAppUser();
  const jobId = String(formData.get("jobId") ?? "");
  const inspectionId = String(formData.get("inspectionId") ?? "");
  const completed = formData.get("completed") === "true";
  try {
    await setInspectionCompleted(user.organizationId, inspectionId, completed);
  } catch {
    // Refresh either way.
  }
  revalidate(jobId);
}

export async function setNocNtboAction(formData: FormData): Promise<void> {
  const user = await requireAppUser();
  const jobId = String(formData.get("jobId") ?? "");
  const field = String(formData.get("field") ?? "");
  const value = formData.get("value") === "true";
  try {
    if (field === "nocOnFile") await setJobNocNtbo(user.organizationId, jobId, { nocOnFile: value });
    if (field === "ntboFiled") await setJobNocNtbo(user.organizationId, jobId, { ntboFiled: value });
  } catch {
    // Refresh either way.
  }
  revalidate(jobId);
}

export async function assignPermitVendorAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireAppUser();
  const jobId = String(formData.get("jobId") ?? "");
  const permitId = String(formData.get("permitId") ?? "");
  const vendorIdRaw = String(formData.get("vendorId") ?? "");
  try {
    await assignPermitVendor(user.organizationId, permitId, vendorIdRaw || null);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not assign vendor." };
  }
  revalidate(jobId);
  return { ok: true };
}

export async function sendPermitReminderAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireAppUser();
  const jobId = String(formData.get("jobId") ?? "");
  const permitId = String(formData.get("permitId") ?? "");
  try {
    const result = await sendPermitReminder(user.organizationId, permitId);
    revalidate(jobId);
    return { ok: true, emailedTo: result.emailedTo };
  } catch (error) {
    if (
      error instanceof PermitNotFoundError ||
      error instanceof JobNotFoundError ||
      error instanceof NoVendorEmailError ||
      error instanceof EmailNotConfiguredError ||
      error instanceof EmailSendError
    ) {
      return { error: error.message };
    }
    return { error: error instanceof Error ? error.message : "Could not send reminder." };
  }
}
