"use server";

import { revalidatePath } from "next/cache";

import {
  InspectionResult,
  PackagePermitType,
  PermitRockstarSetupType,
  PermitStatus,
  PermitTrade,
} from "@/generated/prisma/enums";
import { requireAppUser } from "@/lib/auth";
import { EmailNotConfiguredError, EmailSendError } from "@/lib/email/send";
import { MoneyError, parseDollarsToCents } from "@/lib/money";
import {
  PermitPackageError,
  archivePermitPackage,
  createPermitPackage,
} from "@/lib/permitting/packages";
import { listContractorLicenses } from "@/lib/permitting/package-settings";
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
  const tradeRaw = String(formData.get("trade") ?? "");
  try {
    await updatePermitFields(user.organizationId, permitId, {
      permitNumber: String(formData.get("permitNumber") ?? "").trim() || null,
      label: String(formData.get("label") ?? "").trim() || null,
      trade: STAFF_TRADES.has(tradeRaw) ? (tradeRaw as PermitTrade) : undefined,
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
  const nameRaw = String(formData.get("name") ?? "").trim();
  const permitIdRaw = String(formData.get("permitId") ?? "").trim();
  try {
    await updateInspectionFields(user.organizationId, inspectionId, {
      result: INSPECTION_RESULTS.has(resultRaw) ? (resultRaw as InspectionResult) : undefined,
      passedAt: optionalDate(formData.get("passedAt")),
      confirmationNumber: String(formData.get("confirmationNumber") ?? "").trim() || null,
      inspector: String(formData.get("inspector") ?? "").trim() || null,
      name: nameRaw || undefined,
      permitId: permitIdRaw || undefined,
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
  const invoiceAmountRaw = String(formData.get("invoiceAmountDollars") ?? "").trim();

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

  let invoiceAmountCents: number | null | undefined = undefined;
  if (invoiceAmountRaw === "") {
    invoiceAmountCents = null;
  } else {
    try {
      invoiceAmountCents = parseDollarsToCents(invoiceAmountRaw);
    } catch (error) {
      return {
        error: error instanceof MoneyError ? error.message : "Enter a valid invoice amount.",
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
      invoiceNumber: String(formData.get("invoiceNumber") ?? "").trim() || null,
      invoiceAmountCents,
      invoicedAt: optionalDate(formData.get("invoicedAt")),
      paidAt: optionalDate(formData.get("paidAt")),
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

/** Update NOC/NTBO number + filed date (and optional boolean) from the docs builder. */
export async function updateNocNtboDetailsAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireAppUser();
  const jobId = String(formData.get("jobId") ?? "");
  try {
    await setJobNocNtbo(user.organizationId, jobId, {
      nocOnFile: formData.get("nocOnFile") === "true",
      ntboFiled: formData.get("ntboFiled") === "true",
      nocNumber: String(formData.get("nocNumber") ?? "").trim() || null,
      ntboNumber: String(formData.get("ntboNumber") ?? "").trim() || null,
      nocFiledOn: optionalDate(formData.get("nocFiledOn")),
      ntboFiledOn: optionalDate(formData.get("ntboFiledOn")),
    });
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not update NOC/NTBO." };
  }
  revalidate(jobId);
  return { ok: true };
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

function optionalTrimmed(formData: FormData, key: string): string | undefined {
  const value = String(formData.get(key) ?? "").trim();
  return value || undefined;
}

/** Batch 2: wizard creates a package and fills sourced official PDFs (no external submit). */
export async function createPermitPackageAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireAppUser();
  const jobId = String(formData.get("jobId") ?? "");
  const formKeys = formData
    .getAll("formKeys")
    .map((v) => String(v))
    .filter(Boolean);
  const permitTypeRaw = String(formData.get("permitType") ?? "BUILDING");
  const permitType = Object.values(PackagePermitType).includes(permitTypeRaw as PackagePermitType)
    ? (permitTypeRaw as PackagePermitType)
    : PackagePermitType.BUILDING;

  let contractorLicenseId = String(formData.get("contractorLicenseId") ?? "").trim() || null;
  if (!contractorLicenseId) {
    const licenses = await listContractorLicenses(user.organizationId);
    contractorLicenseId = licenses.find((l) => l.active)?.id ?? licenses[0]?.id ?? null;
  }

  const fieldValues: Record<string, string> = {};
  for (const key of [
    "ownerName",
    "ownerMailingAddress",
    "ownerCityStateZip",
    "ownerPhone",
    "ownerCellPhone",
    "ownerEmail",
    "legalDescription",
    "taxFolio",
    "permitNumber",
    "descriptionOfImprovement",
    "descriptionOfWork",
    "ownersInterest",
    "designatedPersonForNotices",
    "lienorsNoticeRecipient",
    "expirationRule",
  ] as const) {
    const value = optionalTrimmed(formData, key);
    if (value) fieldValues[key] = value;
  }

  try {
    await createPermitPackage(user.organizationId, jobId, {
      name: String(formData.get("name") ?? ""),
      county: String(formData.get("county") ?? "DUVAL"),
      municipality: String(formData.get("municipality") ?? "JACKSONVILLE"),
      permitType,
      propertyAddress: String(formData.get("propertyAddress") ?? "") || null,
      jobPermitId: String(formData.get("jobPermitId") ?? "").trim() || null,
      contractorLicenseId,
      formKeys: formKeys.length > 0 ? formKeys : ["noc", "permission_by_owner", "pais"],
      // EPICS toggle is UI-only until batch 5; force false regardless of form.
      automateWithCity: false,
      fieldValues,
    });
  } catch (error) {
    if (error instanceof PermitPackageError) return { error: error.message };
    return { error: error instanceof Error ? error.message : "Could not create package." };
  }
  revalidate(jobId);
  return { ok: true };
}

export async function archivePermitPackageAction(formData: FormData): Promise<void> {
  const user = await requireAppUser();
  const jobId = String(formData.get("jobId") ?? "");
  const packageId = String(formData.get("packageId") ?? "");
  try {
    await archivePermitPackage(user.organizationId, packageId);
  } catch {
    // refresh either way
  }
  revalidate(jobId);
}
