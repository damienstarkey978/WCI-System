/**
 * Materials Catalog — staff-maintained pricing for Lowe's/Home Depot-type
 * materials (CLAUDE.md's AI estimating layer). Neither retailer has a public
 * pricing API, so until one is integrated this catalog is the AI estimate
 * assistant's first-choice price source; a web-search-sourced item (source:
 * WEB_SEARCH, sourceUrl set) is what the assistant falls back to when nothing
 * here matches, and it's saved back here so the same lookup doesn't repeat.
 */

import { MaterialPriceSource, MaterialVendor } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import type { Cents } from "@/lib/money";

export class MaterialCatalogItemNotFoundError extends Error {
  constructor(itemId: string) {
    super(`Material catalog item ${itemId} not found`);
    this.name = "MaterialCatalogItemNotFoundError";
  }
}

export interface CreateMaterialCatalogItemInput {
  readonly organizationId: string;
  readonly vendor: MaterialVendor;
  readonly sku?: string | null;
  readonly description: string;
  readonly unit: string;
  readonly unitCostCents: Cents;
  readonly category?: string | null;
  readonly source?: MaterialPriceSource;
  readonly sourceUrl?: string | null;
}

export async function createMaterialCatalogItem(input: CreateMaterialCatalogItemInput) {
  return db.materialCatalogItem.create({
    data: {
      organizationId: input.organizationId,
      vendor: input.vendor,
      sku: input.sku ?? null,
      description: input.description,
      unit: input.unit,
      unitCostCents: input.unitCostCents,
      category: input.category ?? null,
      source: input.source ?? MaterialPriceSource.MANUAL,
      sourceUrl: input.sourceUrl ?? null,
      verifiedAt: (input.source ?? MaterialPriceSource.MANUAL) === MaterialPriceSource.MANUAL ? new Date() : null,
    },
  });
}

export interface UpdateMaterialCatalogItemInput {
  readonly organizationId: string;
  readonly itemId: string;
  readonly description?: string;
  readonly unit?: string;
  readonly unitCostCents?: Cents;
  readonly category?: string | null;
  readonly sku?: string | null;
}

/** Editing a price by hand re-verifies it, regardless of how it originally got here. */
export async function updateMaterialCatalogItem(input: UpdateMaterialCatalogItemInput) {
  const item = await db.materialCatalogItem.findFirst({ where: { id: input.itemId, organizationId: input.organizationId } });
  if (!item) throw new MaterialCatalogItemNotFoundError(input.itemId);

  return db.materialCatalogItem.update({
    where: { id: item.id },
    data: {
      description: input.description ?? item.description,
      unit: input.unit ?? item.unit,
      unitCostCents: input.unitCostCents ?? item.unitCostCents,
      category: input.category === undefined ? item.category : input.category,
      sku: input.sku === undefined ? item.sku : input.sku,
      source: MaterialPriceSource.MANUAL,
      verifiedAt: new Date(),
    },
  });
}

export async function deleteMaterialCatalogItem(organizationId: string, itemId: string) {
  const item = await db.materialCatalogItem.findFirst({ where: { id: itemId, organizationId } });
  if (!item) return;
  await db.materialCatalogItem.delete({ where: { id: item.id } });
}

export async function listMaterialCatalogItems(organizationId: string) {
  return db.materialCatalogItem.findMany({
    where: { organizationId },
    orderBy: [{ vendor: "asc" }, { description: "asc" }],
  });
}

/**
 * A web-search-sourced find that the AI estimate assistant discovered and a
 * human hasn't reviewed yet — upserted by description+vendor so repeated
 * lookups for the same item update the price instead of duplicating rows.
 */
export interface UpsertWebSourcedMaterialInput {
  readonly organizationId: string;
  readonly vendor: MaterialVendor;
  readonly description: string;
  readonly unit: string;
  readonly unitCostCents: Cents;
  readonly sourceUrl: string;
  readonly category?: string | null;
}

export async function upsertWebSourcedMaterial(input: UpsertWebSourcedMaterialInput) {
  const existing = await db.materialCatalogItem.findFirst({
    where: { organizationId: input.organizationId, vendor: input.vendor, description: input.description, source: MaterialPriceSource.WEB_SEARCH },
  });

  if (existing) {
    return db.materialCatalogItem.update({
      where: { id: existing.id },
      data: { unitCostCents: input.unitCostCents, unit: input.unit, sourceUrl: input.sourceUrl },
    });
  }

  return db.materialCatalogItem.create({
    data: {
      organizationId: input.organizationId,
      vendor: input.vendor,
      description: input.description,
      unit: input.unit,
      unitCostCents: input.unitCostCents,
      category: input.category ?? null,
      source: MaterialPriceSource.WEB_SEARCH,
      sourceUrl: input.sourceUrl,
    },
  });
}
