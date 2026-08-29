"use server";

import { revalidatePath } from "next/cache";

import { revokeJobAccess as revokeClientJobAccessService, grantJobAccess } from "@/lib/client-portal/service";
import { AccountingBasis, ContractType, ProjectionReference, ScheduleScope, UserRole } from "@/generated/prisma/enums";
import { requireRole } from "@/lib/auth";
import { JobNotFoundError, updateJobDetails } from "@/lib/jobs";
import { grantStaffJobAccess, revokeStaffJobAccess } from "@/lib/staff/service";
import { grantVendorJobAccess, revokeVendorJobAccess } from "@/lib/vendor-portal/service";

export interface ActionState {
  readonly error?: string;
  readonly ok?: boolean;
}

const INITIAL: ActionState = {};

function revalidateSettings(jobId: string) {
  revalidatePath(`/jobs/${jobId}/settings`);
}

function optionalString(formData: FormData, key: string): string | null {
  const value = String(formData.get(key) ?? "").trim();
  return value || null;
}

function optionalDate(formData: FormData, key: string): Date | null {
  const value = String(formData.get(key) ?? "").trim();
  return value ? new Date(value) : null;
}

function optionalInt(formData: FormData, key: string): number | null {
  const value = String(formData.get(key) ?? "").trim();
  if (!value) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function updateJobDetailsAction(jobId: string, _previous: ActionState, formData: FormData): Promise<ActionState> {
  const admin = await requireRole(UserRole.ADMIN, UserRole.PM);

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "Job name is required." };

  const contractType = String(formData.get("contractType") ?? "");
  if (contractType !== ContractType.FIXED_PRICE && contractType !== ContractType.OPEN_BOOK) {
    return { error: "Choose a contract type." };
  }

  try {
    await updateJobDetails(admin.organizationId, jobId, {
      name,
      contractType,
      prefix: optionalString(formData, "prefix"),
      jobGroupId: optionalString(formData, "jobGroupId"),
      addressLine1: optionalString(formData, "addressLine1"),
      addressLine2: optionalString(formData, "addressLine2"),
      city: optionalString(formData, "city"),
      state: optionalString(formData, "state"),
      postalCode: optionalString(formData, "postalCode"),
      sqft: optionalInt(formData, "sqft"),
      permitNumber: optionalString(formData, "permitNumber"),
      lotInfo: optionalString(formData, "lotInfo"),
      projectedStart: optionalDate(formData, "projectedStart"),
      projectedEnd: optionalDate(formData, "projectedEnd"),
      actualStart: optionalDate(formData, "actualStart"),
      actualEnd: optionalDate(formData, "actualEnd"),
      scheduleColor: optionalString(formData, "scheduleColor"),
    });
  } catch (error) {
    if (error instanceof JobNotFoundError) return { error: error.message };
    throw error;
  }

  revalidateSettings(jobId);
  return { ok: true };
}

export async function updateAdvancedSettingsAction(jobId: string, _previous: ActionState, formData: FormData): Promise<ActionState> {
  const admin = await requireRole(UserRole.ADMIN, UserRole.PM);

  const projectionReference = String(formData.get("projectionReference") ?? "") as ProjectionReference;
  const accountingBasis = String(formData.get("accountingBasis") ?? "") as AccountingBasis;

  try {
    await updateJobDetails(admin.organizationId, jobId, {
      projectionReference,
      accountingBasis,
      geofenceRadiusMeters: formData.get("geofencingEnabled") ? optionalInt(formData, "geofenceRadiusMeters") ?? 150 : null,
      isTemplate: formData.get("isTemplate") === "on",
    });
  } catch (error) {
    if (error instanceof JobNotFoundError) return { error: error.message };
    throw error;
  }

  revalidateSettings(jobId);
  return { ok: true };
}

export async function grantClientAccessAction(jobId: string, _previous: ActionState, formData: FormData): Promise<ActionState> {
  const admin = await requireRole(UserRole.ADMIN, UserRole.PM);
  const clientId = String(formData.get("clientId") ?? "");
  if (!clientId) return { error: "Choose a client." };

  await grantJobAccess({
    organizationId: admin.organizationId,
    clientId,
    jobId,
    canViewDailyLogs: true,
    canViewSchedule: true,
    canViewDocuments: true,
    canViewInvoices: true,
    canMakePayments: true,
  });

  revalidateSettings(jobId);
  return { ok: true };
}

export async function updateClientAccessAction(jobId: string, _previous: ActionState, formData: FormData): Promise<ActionState> {
  const admin = await requireRole(UserRole.ADMIN, UserRole.PM);
  const clientId = String(formData.get("clientId") ?? "");
  if (!clientId) return { error: "Missing client id." };

  await grantJobAccess({
    organizationId: admin.organizationId,
    clientId,
    jobId,
    canViewDailyLogs: formData.get("canViewDailyLogs") === "on",
    canViewSchedule: formData.get("canViewSchedule") === "on",
    canViewDocuments: formData.get("canViewDocuments") === "on",
    canViewBudget: formData.get("canViewBudget") === "on",
    canViewInvoices: formData.get("canViewInvoices") === "on",
    canMakePayments: formData.get("canMakePayments") === "on",
    canViewBills: formData.get("canViewBills") === "on",
    canViewSelections: formData.get("canViewSelections") === "on",
    canApproveSelections: formData.get("canApproveSelections") === "on",
    canViewChangeOrders: formData.get("canViewChangeOrders") === "on",
    canApproveChangeOrders: formData.get("canApproveChangeOrders") === "on",
  });

  revalidateSettings(jobId);
  return { ok: true };
}

export async function revokeClientAccessAction(jobId: string, clientId: string): Promise<void> {
  const admin = await requireRole(UserRole.ADMIN, UserRole.PM);
  await revokeClientJobAccessService(admin.organizationId, clientId, jobId);
  revalidateSettings(jobId);
}

export async function grantInternalUserAccessAction(jobId: string, _previous: ActionState, formData: FormData): Promise<ActionState> {
  const admin = await requireRole(UserRole.ADMIN, UserRole.PM);
  const userId = String(formData.get("userId") ?? "");
  if (!userId) return { error: "Choose a staff member." };

  await grantStaffJobAccess({
    organizationId: admin.organizationId,
    userId,
    jobId,
    scheduleScope: ScheduleScope.ALL_ITEMS,
    canViewPricing: false,
    canViewCostDetail: false,
    canManageSchedule: false,
    canApproveChangeOrders: false,
    canViewDocuments: true,
    canCommunicateWithClient: false,
  });

  revalidateSettings(jobId);
  return { ok: true };
}

export async function updateInternalUserAccessAction(jobId: string, _previous: ActionState, formData: FormData): Promise<ActionState> {
  const admin = await requireRole(UserRole.ADMIN, UserRole.PM);
  const userId = String(formData.get("userId") ?? "");
  if (!userId) return { error: "Missing user id." };

  await grantStaffJobAccess({
    organizationId: admin.organizationId,
    userId,
    jobId,
    scheduleScope: formData.get("scheduleAllItems") === "on" ? ScheduleScope.ALL_ITEMS : ScheduleScope.ASSIGNED_ONLY,
    canViewPricing: formData.get("canViewPricing") === "on",
    canViewCostDetail: formData.get("canViewCostDetail") === "on",
    canManageSchedule: formData.get("canManageSchedule") === "on",
    canApproveChangeOrders: formData.get("canApproveChangeOrders") === "on",
    canViewDocuments: formData.get("canViewDocuments") === "on",
    canCommunicateWithClient: formData.get("canCommunicateWithClient") === "on",
  });

  revalidateSettings(jobId);
  return { ok: true };
}

export async function revokeInternalUserAccessAction(jobId: string, userId: string): Promise<void> {
  const admin = await requireRole(UserRole.ADMIN, UserRole.PM);
  await revokeStaffJobAccess(admin.organizationId, userId, jobId);
  revalidateSettings(jobId);
}

export async function grantVendorAccessAction(jobId: string, _previous: ActionState, formData: FormData): Promise<ActionState> {
  const admin = await requireRole(UserRole.ADMIN, UserRole.PM);
  const vendorId = String(formData.get("vendorId") ?? "");
  if (!vendorId) return { error: "Choose a sub/vendor." };

  await grantVendorJobAccess({
    organizationId: admin.organizationId,
    vendorId,
    jobId,
    scheduleScope: ScheduleScope.ASSIGNED_ONLY,
    canViewDocuments: true,
    canViewPurchaseOrders: true,
    canViewBills: true,
  });

  revalidateSettings(jobId);
  return { ok: true };
}

export async function updateVendorAccessAction(jobId: string, _previous: ActionState, formData: FormData): Promise<ActionState> {
  const admin = await requireRole(UserRole.ADMIN, UserRole.PM);
  const vendorId = String(formData.get("vendorId") ?? "");
  if (!vendorId) return { error: "Missing vendor id." };

  await grantVendorJobAccess({
    organizationId: admin.organizationId,
    vendorId,
    jobId,
    scheduleScope: formData.get("scheduleAllItems") === "on" ? ScheduleScope.ALL_ITEMS : ScheduleScope.ASSIGNED_ONLY,
    canViewDocuments: formData.get("canViewDocuments") === "on",
    canViewPurchaseOrders: formData.get("canViewPurchaseOrders") === "on",
    canViewBills: formData.get("canViewBills") === "on",
  });

  revalidateSettings(jobId);
  return { ok: true };
}

export async function revokeVendorAccessAction(jobId: string, vendorId: string): Promise<void> {
  const admin = await requireRole(UserRole.ADMIN, UserRole.PM);
  await revokeVendorJobAccess(admin.organizationId, vendorId, jobId);
  revalidateSettings(jobId);
}

export const INITIAL_ACTION_STATE = INITIAL;
