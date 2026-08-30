"use server";

import { revalidatePath } from "next/cache";

import { ScheduleScope } from "@/generated/prisma/enums";
import { requireAppUser } from "@/lib/auth";
import { QuickBooksApiError, QuickBooksNotConfiguredError } from "@/lib/quickbooks/client";
import { QuickBooksNotConnectedError } from "@/lib/quickbooks/connection-service";
import { syncVendorToQuickBooks } from "@/lib/quickbooks/sync/vendors";
import { addCertification, grantVendorJobAccess, JobNotFoundError, VendorNotFoundError } from "@/lib/vendor-portal/service";

export interface ActionState {
  readonly error?: string;
  readonly ok?: boolean;
}

export async function grantVendorJobAccessAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireAppUser();

  const vendorId = String(formData.get("vendorId") ?? "");
  const jobId = String(formData.get("jobId") ?? "");
  const scheduleScope = String(formData.get("scheduleScope") ?? "ASSIGNED_ONLY") === "ALL_ITEMS" ? ScheduleScope.ALL_ITEMS : ScheduleScope.ASSIGNED_ONLY;

  if (!jobId) return { error: "Choose a job." };

  try {
    await grantVendorJobAccess({
      organizationId: user.organizationId,
      vendorId,
      jobId,
      scheduleScope,
      canViewDocuments: formData.get("canViewDocuments") === "on",
      canViewPurchaseOrders: formData.get("canViewPurchaseOrders") === "on",
      canViewBills: formData.get("canViewBills") === "on",
    });
  } catch (error) {
    if (error instanceof VendorNotFoundError || error instanceof JobNotFoundError) return { error: error.message };
    throw error;
  }

  revalidatePath(`/vendors/${vendorId}`);
  return { ok: true };
}

/** Explicit "Sync to QuickBooks" action (CLAUDE.md 2.3) — same pattern as invoice sync's SyncToQuickBooksButton. */
export async function syncVendorToQuickBooksAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireAppUser();

  const vendorId = String(formData.get("vendorId") ?? "");

  try {
    await syncVendorToQuickBooks(user.organizationId, vendorId);
  } catch (error) {
    if (error instanceof QuickBooksNotConfiguredError || error instanceof QuickBooksNotConnectedError || error instanceof QuickBooksApiError) {
      return { error: error.message };
    }
    throw error;
  }

  revalidatePath(`/vendors/${vendorId}`);
  return { ok: true };
}

export async function addVendorCertificationAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireAppUser();

  const vendorId = String(formData.get("vendorId") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  const expiresAtRaw = String(formData.get("expiresAt") ?? "");
  const notes = String(formData.get("notes") ?? "").trim();

  if (!title) return { error: "Title is required." };
  if (!expiresAtRaw) return { error: "Expiration date is required." };

  try {
    await addCertification({
      organizationId: user.organizationId,
      vendorId,
      title,
      expiresAt: new Date(expiresAtRaw),
      notes: notes || null,
    });
  } catch (error) {
    if (error instanceof VendorNotFoundError) return { error: error.message };
    throw error;
  }

  revalidatePath(`/vendors/${vendorId}`);
  return { ok: true };
}
