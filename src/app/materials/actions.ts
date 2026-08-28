"use server";

import { revalidatePath } from "next/cache";

import { MaterialVendor } from "@/generated/prisma/enums";
import { requireAppUser } from "@/lib/auth";
import {
  createMaterialCatalogItem,
  deleteMaterialCatalogItem,
  MaterialCatalogItemNotFoundError,
  MaterialPriceNotFoundError,
  searchAndSaveWebPrice,
  updateMaterialCatalogItem,
} from "@/lib/materials/service";
import { AiNotConfiguredError, WebPriceSearchError } from "@/lib/materials/web-search";
import { parseDollarsToCents } from "@/lib/money";

export interface ActionState {
  readonly error?: string;
  readonly ok?: boolean;
}

function parseVendor(raw: string): MaterialVendor {
  if (raw === "LOWES" || raw === "HOME_DEPOT" || raw === "OTHER") return raw;
  return MaterialVendor.OTHER;
}

export async function createMaterialCatalogItemAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireAppUser();

  const description = String(formData.get("description") ?? "").trim();
  const vendor = parseVendor(String(formData.get("vendor") ?? "OTHER"));
  const sku = String(formData.get("sku") ?? "").trim();
  const unit = String(formData.get("unit") ?? "").trim();
  const unitCostRaw = String(formData.get("unitCost") ?? "");
  const category = String(formData.get("category") ?? "").trim();

  if (!description) return { error: "Description is required." };
  if (!unit) return { error: "Unit is required." };
  if (!unitCostRaw) return { error: "Unit cost is required." };

  try {
    await createMaterialCatalogItem({
      organizationId: user.organizationId,
      vendor,
      description,
      unit,
      unitCostCents: parseDollarsToCents(unitCostRaw),
      sku: sku || null,
      category: category || null,
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes("Cannot parse")) return { error: error.message };
    throw error;
  }

  revalidatePath("/materials");
  return { ok: true };
}

export async function updateMaterialCatalogItemAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireAppUser();

  const itemId = String(formData.get("itemId") ?? "");
  const description = String(formData.get("description") ?? "").trim();
  const unit = String(formData.get("unit") ?? "").trim();
  const unitCostRaw = String(formData.get("unitCost") ?? "");

  if (!description) return { error: "Description is required." };
  if (!unit) return { error: "Unit is required." };
  if (!unitCostRaw) return { error: "Unit cost is required." };

  try {
    await updateMaterialCatalogItem({
      organizationId: user.organizationId,
      itemId,
      description,
      unit,
      unitCostCents: parseDollarsToCents(unitCostRaw),
    });
  } catch (error) {
    if (error instanceof MaterialCatalogItemNotFoundError) return { error: error.message };
    if (error instanceof Error && error.message.includes("Cannot parse")) return { error: error.message };
    throw error;
  }

  revalidatePath("/materials");
  return { ok: true };
}

export async function searchWebPriceAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireAppUser();

  const description = String(formData.get("description") ?? "").trim();
  const category = String(formData.get("category") ?? "").trim();

  if (!description) return { error: "Enter what you're looking for, e.g. \"2x6x8 SPF stud\"." };

  try {
    await searchAndSaveWebPrice(user.organizationId, description, category || null);
  } catch (error) {
    if (error instanceof AiNotConfiguredError) return { error: "Web price lookup isn't configured yet — set ANTHROPIC_API_KEY in .env." };
    if (error instanceof MaterialPriceNotFoundError || error instanceof WebPriceSearchError) return { error: error.message };
    throw error;
  }

  revalidatePath("/materials");
  return { ok: true };
}

export async function deleteMaterialCatalogItemAction(formData: FormData): Promise<void> {
  const user = await requireAppUser();
  const itemId = String(formData.get("itemId") ?? "");
  await deleteMaterialCatalogItem(user.organizationId, itemId);
  revalidatePath("/materials");
}
