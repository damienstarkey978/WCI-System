"use server";

import { revalidatePath } from "next/cache";

import { requireAppUser } from "@/lib/auth";
import { importVendors, InvalidVendorSheetError, parseVendorSheet, type VendorImportSummary } from "@/lib/vendor-portal/import";
import { createVendor } from "@/lib/vendor-portal/service";

export interface ActionState {
  readonly error?: string;
  readonly ok?: boolean;
}

export async function createVendorAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireAppUser();

  const text = (key: string) => String(formData.get(key) ?? "").trim();
  const name = text("name");
  const email = text("email").toLowerCase();

  if (!name) return { error: "Name is required." };

  try {
    await createVendor({
      organizationId: user.organizationId,
      name,
      email: email || null,
      tradeType: text("tradeType") || null,
      primaryContact: text("primaryContact") || null,
      phone: text("phone") || null,
      cellPhone: text("cellPhone") || null,
    });
  } catch (error) {
    if (error instanceof Error && /unique/i.test(error.message)) {
      return { error: `A vendor with email "${email}" already exists.` };
    }
    throw error;
  }

  revalidatePath("/vendors");
  return { ok: true };
}

export interface ImportVendorsState {
  readonly error?: string;
  readonly summary?: VendorImportSummary;
}

export async function importVendorsAction(_previous: ImportVendorsState, formData: FormData): Promise<ImportVendorsState> {
  const user = await requireAppUser();

  const file = formData.get("sheet");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a CSV file to import." };
  if (/\.xlsx?$/i.test(file.name)) {
    return { error: "That's an Excel file. Open it in Excel (or Numbers) and use File → Save As / Export → CSV, then upload the CSV." };
  }

  try {
    const rows = parseVendorSheet(await file.text());
    const summary = await importVendors(user.organizationId, rows);
    revalidatePath("/vendors");
    return { summary };
  } catch (error) {
    if (error instanceof InvalidVendorSheetError) return { error: error.message };
    throw error;
  }
}
