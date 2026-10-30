"use server";

import { revalidatePath } from "next/cache";

import {
  InspectionResult,
  PermitRockstarSetupType,
  PermitStatus,
  PermitTrade,
} from "@/generated/prisma/enums";
import { requireAppUser } from "@/lib/auth";
import { EmailNotConfiguredError, EmailSendError } from "@/lib/email/send";
import { MoneyError, parseDollarsToCents } from "@/lib/money";
import {
  addPermitInspection,
  assignPermitVendor,
  createJobPermit,
  deleteJobPermit,
  InspectionNotFoundError,
  JobNotFoundError,
  NoVendorEmailError,
  PermitNotFoundError,
  removePermitInspection,
  sendPermitReminder,
  setInspectionCompleted,
  setJobNocNtbo,
  setPermitPulled,
  updateInspectionFields,
  updatePermitFields,
  updatePermitRockstarLedger,
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

const STAFF_TRADES = new Set<string>(Object.values(PermitTrade));
const PERMIT_STATUSES = new Set<string>(Object.values(PermitStatus));
const INSPECTION_RESULTS = new Set<string>(Object.values(InspectionResult));
const ROCKSTAR_SETUPS = new Set<string>(Object.values(PermitRockstarSetupType));

function optionalDate(raw: FormDataEntryValue | null): Date | null | undefined {
  if (raw === null) return undefined;
  const value = String(raw).trim();
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export async function addJobPermitAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireAppUser();
  const jobId = String(formData.get("jobId") ?? "");
  const tradeRaw = String(formData.get("trade") ?? "");
  const label = String(formData.get("label") ?? "").trim();
  if (!STAFF_TRADES.has(tradeRaw)) {
    return { error: "Select a valid permit type." };
  }
  try {
    await createJobPermit(user.organizationId, jobId, tradeRaw as PermitTrade, {
      label: label || null,
      seedDefaultInspections: formData.get("seedDefaults") !== "false",
    });
  } catch (error) {
    if (error instanceof JobNotFoundError || error instanceof Error) {
      return { error: error instanceof Error ? error.message : "Could not add permit." };
    }
  }
  revalidate(jobId);
  return { ok: true };
}

export async function updatePermitFieldsAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireAppUser();
  const jobId = String(formData.get("jobId") ?? "");
  const permitId = String(formData.get("permitId") ?? "");
  const statusRaw = String(formData.get("status") ?? "");
  try {
    await updatePermitFields(user.organizationId, permitId, {
      permitNumber: String(formData.get("permitNumber") ?? "").trim() || null,
      label: String(formData.get("label") ?? "").trim() || null,
      status: PERMIT_STATUSES.has(statusRaw) ? (statusRaw as PermitStatus) : undefined,
      issuedAt: optionalDate(formData.get("issuedAt")),
      expiresAt: optionalDate(formData.get("expiresAt")),
      jurisdiction: String(formData.get("jurisdiction") ?? "").trim() || null,
      contractorName: String(formData.get("contractorName") ?? "").trim() || null,
    });
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not update permit." };
  }
  revalidate(jobId);
  return { ok: true };
}

export async function updateInspectionFieldsAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireAppUser();
  const jobId = String(formData.get("jobId") ?? "");
  const inspectionId = String(formData.get("inspectionId") ?? "");
  const resultRaw = String(formData.get("result") ?? "");
  try {
    await updateInspectionFields(user.organizationId, inspectionId, {
      result: INSPECTION_RESULTS.has(resultRaw) ? (resultRaw as InspectionResult) : undefined,
      passedAt: optionalDate(formData.get("passedAt")),
      confirmationNumber: String(formData.get("confirmationNumber") ?? "").trim() || null,
      inspector: String(formData.get("inspector") ?? "").trim() || null,
    });
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not update inspection." };
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

export async function updatePermitRockstarLedgerAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireAppUser();
  const jobId = String(formData.get("jobId") ?? "");
  const setupRaw = String(formData.get("setupType") ?? "").trim();
  const feeRaw = String(formData.get("feePerInspectionDollars") ?? "").trim();

  let feePerInspectionCents: number | null | undefined = undefined;
  if (feeRaw === "") {
    feePerInspectionCents = null;
  } else {
    try {
      feePerInspectionCents = parseDollarsToCents(feeRaw);
    } catch (error) {
      return {
        error: error instanceof MoneyError ? error.message : "Enter a valid fee amount.",
      };
    }
  }

  try {
    await updatePermitRockstarLedger(user.organizationId, jobId, {
      privateProvider: formData.get("privateProvider") === "true",
      setupType: ROCKSTAR_SETUPS.has(setupRaw)
        ? (setupRaw as PermitRockstarSetupType)
        : null,
      invoiced: formData.get("invoiced") === "true",
      paid: formData.get("paid") === "true",
      feePerInspectionCents,
    });
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not update Permit Rockstar ledger." };
  }
  revalidate(jobId);
  return { ok: true };
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

/** Mark / clear building permit doc pack created — drives header "Docs created". */
export async function setBuildingPermitDocsCreatedAction(formData: FormData): Promise<void> {
  const user = await requireAppUser();
  const jobId = String(formData.get("jobId") ?? "");
  const created = formData.get("created") === "true";
  try {
    await setJobNocNtbo(user.organizationId, jobId, { buildingPermitDocsCreated: created });
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
