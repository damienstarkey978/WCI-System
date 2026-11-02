/**
 * Pure schema + normalization for AI "pull products from plans" drafts.
 * Florida approval numbers never come from free text — only via org templateId
 * (Zod enum of real PaisProductTemplate ids). Hallucinated FL# cannot pass validation.
 */

import { z } from "zod";

export interface PaisTemplateOption {
  readonly id: string;
  readonly name: string;
  readonly manufacturer: string | null;
  readonly model: string | null;
  readonly approvalNumber: string | null;
  readonly category: string | null;
  readonly codeVersion: string | null;
  readonly qaExpiration: string | null;
}

export class EmptyPaisTemplateCatalogError extends Error {
  constructor() {
    super(
      "Pull-from-plans needs at least one org PAIS product template so Florida approval numbers stay catalog-bound. Add templates under Permitting settings first.",
    );
    this.name = "EmptyPaisTemplateCatalogError";
  }
}

export function formatPaisTemplateCatalog(templates: readonly PaisTemplateOption[]): string {
  return templates
    .map((t) => {
      const parts = [
        t.id,
        t.name,
        t.manufacturer ?? "",
        t.model ?? "",
        t.approvalNumber ?? "",
        t.category ?? "",
      ];
      return parts.join(" | ");
    })
    .join("\n");
}

/**
 * Build draft schema constrained to the org's real PAIS template ids.
 * Free-text rows may include manufacturer/model/notes but NEVER an approval number.
 */
export function buildPaisPlansDraftSchema(templateIds: readonly string[]) {
  if (templateIds.length === 0) {
    throw new EmptyPaisTemplateCatalogError();
  }
  const [first, ...rest] = templateIds;

  const productFromTemplate = z.object({
    kind: z.literal("TEMPLATE"),
    templateId: z
      .enum([first, ...rest])
      .describe("Must be exactly one of the provided template ids. Never invent a new id or FL#."),
    notes: z
      .string()
      .trim()
      .max(500)
      .nullish()
      .describe("Optional note about where on the plans this product appears."),
    confidence: z.enum(["HIGH", "MEDIUM", "LOW"]),
  });

  const productFreeText = z.object({
    kind: z.literal("FREE_TEXT"),
    manufacturer: z.string().trim().min(1).max(255).describe("Manufacturer from the plans (no FL#)."),
    model: z.string().trim().max(255).nullish().describe("Model / product description from plans."),
    category: z.string().trim().max(120).nullish(),
    notes: z.string().trim().max(500).nullish(),
    confidence: z.enum(["HIGH", "MEDIUM", "LOW"]),
  });

  return z.object({
    products: z
      .array(z.discriminatedUnion("kind", [productFromTemplate, productFreeText]))
      .min(1)
      .max(40)
      .describe(
        "Products visible on the plans. Prefer TEMPLATE when a catalog match exists. " +
          "FREE_TEXT never includes an FL / approval number — staff adds that later.",
      ),
    assumptions: z
      .array(z.string().trim().max(500))
      .max(20)
      .describe("Ambiguous plan callouts or missing catalog matches the reviewer should check."),
  });
}

export type RawPaisPlansDraft = z.infer<ReturnType<typeof buildPaisPlansDraftSchema>>;

export type NormalizedPaisPlansProduct =
  | {
      readonly kind: "TEMPLATE";
      readonly templateId: string;
      readonly notes: string | null;
      readonly confidence: "HIGH" | "MEDIUM" | "LOW";
    }
  | {
      readonly kind: "FREE_TEXT";
      readonly manufacturer: string;
      readonly model: string | null;
      readonly category: string | null;
      readonly notes: string | null;
      readonly confidence: "HIGH" | "MEDIUM" | "LOW";
    };

export interface NormalizedPaisPlansDraft {
  readonly products: readonly NormalizedPaisPlansProduct[];
  readonly assumptions: readonly string[];
}

export function normalizePaisPlansDraft(raw: RawPaisPlansDraft): NormalizedPaisPlansDraft {
  return {
    assumptions: raw.assumptions ?? [],
    products: raw.products.map((p) => {
      if (p.kind === "TEMPLATE") {
        return {
          kind: "TEMPLATE" as const,
          templateId: p.templateId,
          notes: p.notes?.trim() || null,
          confidence: p.confidence,
        };
      }
      return {
        kind: "FREE_TEXT" as const,
        manufacturer: p.manufacturer.trim(),
        model: p.model?.trim() || null,
        category: p.category?.trim() || null,
        notes: p.notes?.trim() || null,
        confidence: p.confidence,
      };
    }),
  };
}
