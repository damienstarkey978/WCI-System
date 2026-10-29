"use server";

import { revalidatePath } from "next/cache";

import { PermitTrade } from "@/generated/prisma/enums";
import { requireAppUser } from "@/lib/auth";
import { EmailNotConfiguredError, EmailSendError } from "@/lib/email/send";
import {
  addPermitInspection,
  assignPermitVendor,
  createJobPermit,
  deleteJobPermit,
  InspectionNotFoundError,
  JobNotFoundError,
  NoVendorEmailError,
  PermitAlreadyExistsError,
  PermitNotFoundError,
  removePermitInspection,
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
  revalidatePath(`/jobs/${jobId}/permitting/docs`);
  revalidatePath(`/jobs/${jobId}/files/inspection-pictures`);
}

const STAFF_TRADES = new Set<string>([
  PermitTrade.BUILDING,
  PermitTrade.ELECTRICAL,
  PermitTrade.PLUMBING,
  PermitTrade.MECHANICAL,
  PermitTrade.ROOFING,
]);

export async function addJobPermitAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireAppUser();
  const jobId = String(formData.get("jobId") ?? "");
  const tradeRaw = String(formData.get("trade") ?? "");
  if (!STAFF_TRADES.has(tradeRaw)) {
    return { error: "Select a valid permit type." };
  }
  try {
    await createJobPermit(user.organizationId, jobId, tradeRaw as PermitTrade);
  } catch (error) {
    if (
      error instanceof JobNotFoundError ||
      error instanceof PermitAlreadyExistsError ||
      error instanceof Error
    ) {
      return { error: error instanceof Error ? error.message : "Could not add permit." };
    }
  }
  revalidate(jobId);
  return { ok: true };
}

export async function removeJobPermitAction(formData: FormData): Promise<void> {
  const user = await requireAppUser();
  const jobId = String(formData.get("jobId") ?? "");
  const permitId = String(formData.get("permitId") ?? "");
  try {
    await deleteJobPermit(user.organizationId, permitId);
  } catch {
    // Refresh either way.
  }
  revalidate(jobId);
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

export async function addPermitInspectionAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireAppUser();
  const jobId = String(formData.get("jobId") ?? "");
  const permitId = String(formData.get("permitId") ?? "");
  const name = String(formData.get("name") ?? "");
  try {
    await addPermitInspection(user.organizationId, permitId, name);
  } catch (error) {
    if (error instanceof PermitNotFoundError) return { error: error.message };
    return { error: error instanceof Error ? error.message : "Could not add inspection." };
  }
  revalidate(jobId);
  return { ok: true };
}

export async function removePermitInspectionAction(formData: FormData): Promise<void> {
  const user = await requireAppUser();
  const jobId = String(formData.get("jobId") ?? "");
  const inspectionId = String(formData.get("inspectionId") ?? "");
  try {
    await removePermitInspection(user.organizationId, inspectionId);
  } catch (error) {
    if (!(error instanceof InspectionNotFoundError)) {
      // Refresh either way for missing rows; leave other errors silent on this form.
    }
  }
  revalidate(jobId);
}
