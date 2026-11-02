/**
 * Pull PAIS product candidates from plan notes (WCI-only AI).
 * Returns a draft for human review — does not persist until staff confirms.
 * Never invents Florida approval numbers (template-bound only).
 */

import { db } from "@/lib/db";
import {
  AiNotConfiguredError,
  draftPaisProductsFromPlans,
  DraftGenerationError,
} from "@/lib/ai/pais-plans-assistant";
import {
  EmptyPaisTemplateCatalogError,
  type NormalizedPaisPlansDraft,
  type NormalizedPaisPlansProduct,
  type PaisTemplateOption,
} from "@/lib/ai/pais-plans-draft";
import {
  addPackageProduct,
  addPackageProductFromTemplate,
  updatePackageProduct,
} from "@/lib/permitting/package-products";
import { PermitPackageError } from "@/lib/permitting/packages";

export { AiNotConfiguredError, DraftGenerationError, EmptyPaisTemplateCatalogError };

export class PackageNotFoundError extends Error {
  constructor() {
    super("Permit package not found.");
    this.name = "PackageNotFoundError";
  }
}

export class JobNotFoundForPlansError extends Error {
  constructor() {
    super("Job not found for this package.");
    this.name = "JobNotFoundForPlansError";
  }
}

export type PaisPlansSuggestion = NormalizedPaisPlansProduct & {
  /** Display helpers resolved from the template catalog when kind=TEMPLATE. */
  readonly manufacturer?: string | null;
  readonly model?: string | null;
  readonly approvalNumber?: string | null;
  readonly category?: string | null;
  readonly templateName?: string | null;
};

export interface PullProductsFromPlansResult {
  readonly draft: NormalizedPaisPlansDraft;
  readonly suggestions: readonly PaisPlansSuggestion[];
}

async function loadTemplates(organizationId: string): Promise<PaisTemplateOption[]> {
  const rows = await db.paisProductTemplate.findMany({
    where: { organizationId },
    orderBy: { name: "asc" },
  });
  return rows.map((t) => ({
    id: t.id,
    name: t.name,
    manufacturer: t.manufacturer,
    model: t.model,
    approvalNumber: t.approvalNumber,
    category: t.category,
    codeVersion: t.codeVersion,
    qaExpiration: t.qaExpiration,
  }));
}

/**
 * Draft PAIS products from plan notes. Does not write PermitPackageProduct rows —
 * call confirmPaisPlansSuggestions after staff review.
 */
export async function pullProductsFromPlans(
  organizationId: string,
  packageId: string,
  planNotes: string,
): Promise<PullProductsFromPlansResult> {
  const notes = planNotes.trim();
  if (notes.length < 10) {
    throw new PermitPackageError("Plan notes must be at least 10 characters.");
  }

  const pkg = await db.permitPackage.findFirst({
    where: { id: packageId, organizationId },
    select: { id: true, job: { select: { id: true, name: true } } },
  });
  if (!pkg) throw new PackageNotFoundError();

  const templates = await loadTemplates(organizationId);
  if (templates.length === 0) throw new EmptyPaisTemplateCatalogError();

  const draft = await draftPaisProductsFromPlans({
    jobName: pkg.job.name,
    planNotes: notes,
    templates,
  });

  const byId = new Map(templates.map((t) => [t.id, t]));
  const suggestions: PaisPlansSuggestion[] = draft.products.map((p) => {
    if (p.kind === "TEMPLATE") {
      const t = byId.get(p.templateId);
      return {
        ...p,
        manufacturer: t?.manufacturer ?? null,
        model: t?.model ?? null,
        approvalNumber: t?.approvalNumber ?? null,
        category: t?.category ?? null,
        templateName: t?.name ?? null,
      };
    }
    return {
      ...p,
      approvalNumber: null,
      templateName: null,
    };
  });

  return { draft, suggestions };
}

export type ConfirmPaisPlansItem =
  | { readonly kind: "TEMPLATE"; readonly templateId: string; readonly notes?: string | null }
  | {
      readonly kind: "FREE_TEXT";
      readonly manufacturer: string;
      readonly model?: string | null;
      readonly category?: string | null;
      readonly notes?: string | null;
    };

/**
 * Persist staff-confirmed suggestions onto the package. Still never invents FL# —
 * TEMPLATE copies from catalog; FREE_TEXT has no approvalNumber.
 */
export async function confirmPaisPlansSuggestions(
  organizationId: string,
  packageId: string,
  items: readonly ConfirmPaisPlansItem[],
) {
  if (items.length === 0) {
    throw new PermitPackageError("Select at least one product to add.");
  }

  const created = [];
  for (const item of items) {
    if (item.kind === "TEMPLATE") {
      const row = await addPackageProductFromTemplate(
        organizationId,
        packageId,
        item.templateId,
      );
      if (item.notes?.trim()) {
        created.push(
          await updatePackageProduct(organizationId, packageId, row.id, {
            notes: item.notes,
          }),
        );
      } else {
        created.push(row);
      }
    } else {
      created.push(
        await addPackageProduct(organizationId, packageId, {
          manufacturer: item.manufacturer,
          model: item.model,
          category: item.category,
          notes: item.notes,
          // Explicitly omit approvalNumber — never invent FL#.
        }),
      );
    }
  }
  return created;
}
