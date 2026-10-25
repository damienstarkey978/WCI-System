"use server";

import { revalidatePath } from "next/cache";

import { ScheduleScope } from "@/generated/prisma/enums";
import { requireAppUser } from "@/lib/auth";
import { QuickBooksApiError, QuickBooksNotConfiguredError } from "@/lib/quickbooks/client";
import { QuickBooksNotConnectedError } from "@/lib/quickbooks/connection-service";
import { syncVendorToQuickBooks } from "@/lib/quickbooks/sync/vendors";
import { appBaseUrl } from "@/lib/app-url";
import { inviteVendorToPortal, type VendorInviteResult } from "@/lib/vendor-portal/invite";
import { VendorMissingEmailError } from "@/lib/vendor-portal/auth";
import { addCertification, grantVendorJobAccess, JobNotFoundError, updateVendorContact, VendorNotFoundError } from "@/lib/vendor-portal/service";

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

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function updateVendorContactAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireAppUser();

  const text = (key: string) => String(formData.get(key) ?? "").trim();
  const vendorId = text("vendorId");
  const name = text("name");
  const email = text("email").toLowerCase();

  if (!name) return { error: "Company name is required." };
  if (email && !EMAIL_PATTERN.test(email)) return { error: `"${email}" doesn't look like an email address.` };

  try {
    await updateVendorContact({
      organizationId: user.organizationId,
      vendorId,
      name,
      email: email || null,
      primaryContact: text("primaryContact") || null,
      phone: text("phone") || null,
      cellPhone: text("cellPhone") || null,
    });
  } catch (error) {
    if (error instanceof VendorNotFoundError) return { error: error.message };
    if (error instanceof Error && /unique/i.test(error.message)) return { error: `Another vendor already uses the email "${email}".` };
    throw error;
  }

  revalidatePath(`/vendors/${vendorId}`);
  revalidatePath("/vendors");
  return { ok: true };
}

export interface InviteVendorState {
  readonly error?: string;
  readonly invite?: VendorInviteResult;
}

export async function inviteVendorAction(_previous: InviteVendorState, formData: FormData): Promise<InviteVendorState> {
  const user = await requireAppUser();
  const vendorId = String(formData.get("vendorId") ?? "");

  try {
    const invite = await inviteVendorToPortal(user.organizationId, vendorId, await appBaseUrl());
    revalidatePath(`/vendors/${vendorId}`);
    revalidatePath("/vendors");
    return { invite };
  } catch (error) {
    if (error instanceof VendorNotFoundError || error instanceof VendorMissingEmailError) return { error: error.message };
    throw error;
  }
}
