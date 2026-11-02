/**
 * PAIS product rows on a permit package + org template search.
 * Never invent Florida approval numbers — staff/templates/AI drafts only.
 */

import { db } from "@/lib/db";
import { PermitPackageError } from "@/lib/permitting/packages";

export type PackageProductInput = {
  readonly manufacturer?: string | null;
  readonly model?: string | null;
  readonly approvalNumber?: string | null;
  readonly category?: string | null;
  readonly codeVersion?: string | null;
  readonly qaExpiration?: string | null;
  readonly expiresAt?: Date | null;
  readonly notes?: string | null;
  readonly templateId?: string | null;
  readonly sortOrder?: number;
};

function trimOrNull(value: string | null | undefined): string | null {
  const t = (value ?? "").trim();
  return t || null;
}

async function assertPackage(organizationId: string, packageId: string) {
  const pkg = await db.permitPackage.findFirst({
    where: { id: packageId, organizationId },
    select: { id: true },
  });
  if (!pkg) throw new PermitPackageError("Permit package not found.", "not_found");
  return pkg;
}

export async function listPackageProducts(organizationId: string, packageId: string) {
  await assertPackage(organizationId, packageId);
  return db.permitPackageProduct.findMany({
    where: { packageId },
    orderBy: { sortOrder: "asc" },
  });
}

/** Active products for PAIS fill — hide expired when expiresAt is in the past. */
export function filterActivePaisProducts<T extends { expiresAt: Date | null }>(
  products: readonly T[],
  now = new Date(),
): T[] {
  return products.filter((p) => !p.expiresAt || p.expiresAt.getTime() > now.getTime());
}

export async function addPackageProduct(
  organizationId: string,
  packageId: string,
  input: PackageProductInput,
) {
  await assertPackage(organizationId, packageId);
  const approvalNumber = trimOrNull(input.approvalNumber);
  const manufacturer = trimOrNull(input.manufacturer);
  const model = trimOrNull(input.model);
  if (!approvalNumber && !manufacturer && !model) {
    throw new PermitPackageError(
      "Enter at least a manufacturer, model, or Florida approval number (never invent an FL#).",
    );
  }

  const max = await db.permitPackageProduct.aggregate({
    where: { packageId },
    _max: { sortOrder: true },
  });
  const sortOrder = input.sortOrder ?? (max._max.sortOrder ?? -1) + 1;

  return db.permitPackageProduct.create({
    data: {
      packageId,
      templateId: input.templateId ?? null,
      manufacturer,
      model,
      approvalNumber,
      category: trimOrNull(input.category),
      codeVersion: trimOrNull(input.codeVersion),
      qaExpiration: trimOrNull(input.qaExpiration),
      expiresAt: input.expiresAt ?? null,
      notes: trimOrNull(input.notes),
      sortOrder,
    },
  });
}

export async function updatePackageProduct(
  organizationId: string,
  packageId: string,
  productId: string,
  input: PackageProductInput,
) {
  await assertPackage(organizationId, packageId);
  const existing = await db.permitPackageProduct.findFirst({
    where: { id: productId, packageId },
  });
  if (!existing) throw new PermitPackageError("Product not found.", "not_found");

  return db.permitPackageProduct.update({
    where: { id: productId },
    data: {
      ...(input.manufacturer !== undefined ? { manufacturer: trimOrNull(input.manufacturer) } : {}),
      ...(input.model !== undefined ? { model: trimOrNull(input.model) } : {}),
      ...(input.approvalNumber !== undefined
        ? { approvalNumber: trimOrNull(input.approvalNumber) }
        : {}),
      ...(input.category !== undefined ? { category: trimOrNull(input.category) } : {}),
      ...(input.codeVersion !== undefined ? { codeVersion: trimOrNull(input.codeVersion) } : {}),
      ...(input.qaExpiration !== undefined ? { qaExpiration: trimOrNull(input.qaExpiration) } : {}),
      ...(input.expiresAt !== undefined ? { expiresAt: input.expiresAt } : {}),
      ...(input.notes !== undefined ? { notes: trimOrNull(input.notes) } : {}),
      ...(input.templateId !== undefined ? { templateId: input.templateId } : {}),
      ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
    },
  });
}

export async function removePackageProduct(
  organizationId: string,
  packageId: string,
  productId: string,
) {
  await assertPackage(organizationId, packageId);
  const existing = await db.permitPackageProduct.findFirst({
    where: { id: productId, packageId },
  });
  if (!existing) throw new PermitPackageError("Product not found.", "not_found");
  await db.permitPackageProduct.delete({ where: { id: productId } });
}

export async function addPackageProductFromTemplate(
  organizationId: string,
  packageId: string,
  templateId: string,
) {
  const template = await db.paisProductTemplate.findFirst({
    where: { id: templateId, organizationId },
  });
  if (!template) throw new PermitPackageError("PAIS template not found.", "not_found");
  return addPackageProduct(organizationId, packageId, {
    templateId: template.id,
    manufacturer: template.manufacturer,
    model: template.model,
    approvalNumber: template.approvalNumber,
    category: template.category,
    codeVersion: template.codeVersion,
    qaExpiration: template.qaExpiration,
    notes: template.notes,
  });
}

/**
 * Search org PAIS templates. AND across terms; exact model match ranks first.
 * Does not invent FL numbers — only returns stored templates.
 */
export async function searchPaisTemplates(
  organizationId: string,
  query: {
    readonly q?: string;
    readonly manufacturer?: string;
    readonly model?: string;
    readonly approvalNumber?: string;
    readonly hideExpiredQa?: boolean;
  },
) {
  const rows = await db.paisProductTemplate.findMany({
    where: { organizationId },
    orderBy: { name: "asc" },
  });

  const q = (query.q ?? "").trim().toLowerCase();
  const manufacturer = (query.manufacturer ?? "").trim().toLowerCase();
  const model = (query.model ?? "").trim().toLowerCase();
  const approvalNumber = (query.approvalNumber ?? "").trim().toLowerCase();
  const today = new Date().toISOString().slice(0, 10);

  const filtered = rows.filter((row) => {
    if (manufacturer && !(row.manufacturer ?? "").toLowerCase().includes(manufacturer)) {
      return false;
    }
    if (model && !(row.model ?? "").toLowerCase().includes(model)) return false;
    if (
      approvalNumber &&
      !(row.approvalNumber ?? "").toLowerCase().includes(approvalNumber)
    ) {
      return false;
    }
    if (q) {
      const hay = [row.name, row.manufacturer, row.model, row.approvalNumber, row.category]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      // AND: every whitespace token must appear.
      for (const token of q.split(/\s+/).filter(Boolean)) {
        if (!hay.includes(token)) return false;
      }
    }
    if (query.hideExpiredQa && row.qaExpiration) {
      // QA dates are staff-entered free text; only hide when ISO-like YYYY-MM-DD and past.
      if (/^\d{4}-\d{2}-\d{2}/.test(row.qaExpiration) && row.qaExpiration.slice(0, 10) < today) {
        return false;
      }
    }
    return true;
  });

  return filtered
    .map((row) => {
      const exactModel =
        model && (row.model ?? "").trim().toLowerCase() === model ? 2 : 0;
      const exactFl =
        approvalNumber &&
        (row.approvalNumber ?? "").trim().toLowerCase() === approvalNumber
          ? 1
          : 0;
      return { row, rank: exactModel + exactFl };
    })
    .sort((a, b) => b.rank - a.rank || a.row.name.localeCompare(b.row.name))
    .map((x) => x.row);
}
