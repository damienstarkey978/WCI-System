"use server";

import { revalidatePath } from "next/cache";

import { requireAppUser } from "@/lib/auth";
import { createClient } from "@/lib/client-portal/service";
import { importClients, InvalidClientSheetError, parseClientSheet, type ClientImportSummary } from "@/lib/client-portal/import";

export interface ActionState {
  readonly error?: string;
  readonly ok?: boolean;
}

export interface ImportClientsState {
  readonly error?: string;
  readonly summary?: ClientImportSummary;
}

export async function importClientsAction(_previous: ImportClientsState, formData: FormData): Promise<ImportClientsState> {
  const user = await requireAppUser();

  const file = formData.get("sheet");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a CSV file to import." };
  if (/\.xlsx?$/i.test(file.name)) {
    return { error: "That's an Excel file. Open it in Excel (or Numbers) and use File → Save As / Export → CSV, then upload the CSV." };
  }

  try {
    const rows = parseClientSheet(await file.text());
    const summary = await importClients(user.organizationId, rows);
    revalidatePath("/clients");
    return { summary };
  } catch (error) {
    if (error instanceof InvalidClientSheetError) return { error: error.message };
    throw error;
  }
}

export async function createClientAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireAppUser();

  const text = (key: string) => String(formData.get(key) ?? "").trim();
  const name = text("name");
  const email = text("email").toLowerCase();

  if (!name) return { error: "Name is required." };
  if (!email) return { error: "Email is required." };

  try {
    await createClient({
      organizationId: user.organizationId,
      name,
      email,
      phone: text("phone") || null,
      cellPhone: text("cellPhone") || null,
      addressLine1: text("addressLine1") || null,
      city: text("city") || null,
      state: text("state") || null,
      postalCode: text("postalCode") || null,
    });
  } catch (error) {
    if (error instanceof Error && /unique/i.test(error.message)) {
      return { error: `A client with email "${email}" already exists.` };
    }
    throw error;
  }

  revalidatePath("/clients");
  return { ok: true };
}
