/**
 * Pure schema and normalization logic for AI-drafted estimates. No network calls, no
 * database — kept separate from src/lib/ai/estimate-assistant.ts so the conversion
 * arithmetic is unit-testable without mocking Claude.
 *
 * The core safety property lives in `buildLineItemSchema`: `costCodeId` is a Zod enum
 * built from the org's *actual* cost codes, so a hallucinated code is structurally
 * impossible in a schema-validated response — not just discouraged by a prompt.
 *
 * A draft now carries both sides of the handoff.ai-style split screen in one shot:
 * `lineItems` (internal, cost-code-priced, groupLabel-grouped — the Estimate) and
 * `proposalSections` (client-facing plain-language bullets grouped the same way —
 * the Proposal). They're generated together but stored as separate rows
 * (EstimateLineItem vs ProposalSection/ProposalSectionBullet) precisely so they can
 * drift apart after a human edits either side, same as the real tool.
 */

import { z } from "zod";

import { RateMode } from "@/generated/prisma/enums";
import { parseDollarsToCents, parsePercentToBasisPoints, type BasisPoints, type Cents } from "@/lib/money";

export interface CostCodeOption {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly defaultCostType: string;
}

export class EmptyCostCodeCatalogError extends Error {
  constructor() {
    super("Cannot draft an estimate with no cost codes in the organization's catalog.");
    this.name = "EmptyCostCodeCatalogError";
  }
}

/** Build the per-line schema, constraining costCodeId to the given catalog. */
export function buildLineItemSchema(costCodeIds: readonly string[]) {
  if (costCodeIds.length === 0) {
    throw new EmptyCostCodeCatalogError();
  }
  const [first, ...rest] = costCodeIds;
  return z.object({
    costCodeId: z
      .enum([first, ...rest])
      .describe("Must be exactly one of the provided cost code ids. Never invent a new one."),
    groupLabel: z
      .string()
      .trim()
      .min(1)
      .max(80)
      .describe(
        "The construction phase/section this line belongs to, e.g. 'Plans & Permitting', 'Foundation & Concrete', 'Framing & Structural'. Every line sharing a groupLabel forms one section of the estimate and the proposal.",
      ),
    title: z.string().trim().min(1).max(255),
    description: z.string().trim().max(1_000).nullish(),
    quantity: z.number().positive().max(1_000_000).describe("Quantity in whole units (hours, gallons, sq ft, etc.)"),
    unit: z.string().trim().max(40).nullish().describe("Unit of measure, e.g. 'hr', 'gal', 'sqft'"),
    unitCostDollars: z.number().positive().max(10_000_000).describe("Cost per unit in dollars, before markup"),
    ratePercent: z.number().min(0).max(200).describe("Markup or margin percent to apply on top of cost"),
    rateMode: z.enum(RateMode).default(RateMode.MARKUP),
    confidence: z
      .enum(["HIGH", "MEDIUM", "LOW"])
      .describe("How confident you are in this line's quantity and pricing"),
    priceSource: z
      .enum(["CATALOG", "MARKET_RATE"])
      .describe("CATALOG when this unit cost came from a given material catalog entry; MARKET_RATE otherwise"),
  });
}

const proposalSectionSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1)
    .max(80)
    .describe("Must match one of the groupLabel values used in lineItems — one proposal section per estimate group."),
  bullets: z
    .array(z.string().trim().min(1).max(400))
    .min(1)
    .max(12)
    .describe("Plain-language, client-facing description of the work in this section — no pricing, no internal cost-code jargon."),
});

/** Build the full draft schema for one call, scoped to the org's cost code catalog. */
export function buildEstimateDraftSchema(costCodeIds: readonly string[]) {
  return z.object({
    title: z.string().trim().min(1).max(255),
    projectDescription: z
      .string()
      .trim()
      .min(1)
      .max(2_000)
      .describe(
        "A short client-facing paragraph summarizing the project scope, written the way a proposal cover message reads — e.g. 'This estimate covers a full home addition project, encompassing approximately...'.",
      ),
    lineItems: z.array(buildLineItemSchema(costCodeIds)).min(1).max(150),
    proposalSections: z.array(proposalSectionSchema).min(1).max(30),
    assumptions: z
      .array(z.string().trim().max(500))
      .max(20)
      .describe("Assumptions made or gaps the estimator should confirm before this is sent to the client"),
  });
}

export type RawEstimateDraft = z.infer<ReturnType<typeof buildEstimateDraftSchema>>;
export type RawEstimateLineItem = RawEstimateDraft["lineItems"][number];
export type RawProposalSection = RawEstimateDraft["proposalSections"][number];

export interface NormalizedEstimateLine {
  readonly costCodeId: string;
  readonly groupLabel: string;
  readonly title: string;
  readonly description: string | null;
  readonly quantityMilli: number;
  readonly unitCostCents: Cents;
  readonly rateMode: RateMode;
  readonly rateBasisPoints: BasisPoints;
  readonly confidence: "HIGH" | "MEDIUM" | "LOW";
  readonly priceSource: "CATALOG" | "MARKET_RATE";
}

export interface NormalizedProposalSection {
  readonly title: string;
  readonly bullets: readonly string[];
}

export interface NormalizedEstimateDraft {
  readonly title: string;
  readonly projectDescription: string;
  readonly lineItems: readonly NormalizedEstimateLine[];
  readonly proposalSections: readonly NormalizedProposalSection[];
  readonly assumptions: readonly string[];
}

/**
 * Convert the AI's dollars/percent output into the integer cents/basis-points/milli
 * units the rest of the system uses (CLAUDE.md 5). This is the one place a float from
 * the model touches money — everything downstream of this function is integer math.
 */
export function normalizeEstimateDraft(raw: RawEstimateDraft): NormalizedEstimateDraft {
  return {
    title: raw.title,
    projectDescription: raw.projectDescription,
    assumptions: raw.assumptions,
    lineItems: raw.lineItems.map((line) => normalizeLine(line)),
    proposalSections: raw.proposalSections.map((section) => ({ title: section.title, bullets: section.bullets })),
  };
}

function normalizeLine(line: RawEstimateLineItem): NormalizedEstimateLine {
  return {
    costCodeId: line.costCodeId,
    groupLabel: line.groupLabel,
    title: line.title,
    description: line.description ?? null,
    quantityMilli: Math.round(line.quantity * 1_000),
    unitCostCents: parseDollarsToCents(line.unitCostDollars),
    rateMode: line.rateMode,
    rateBasisPoints: parsePercentToBasisPoints(line.ratePercent),
    confidence: line.confidence,
    priceSource: line.priceSource,
  };
}

/** A one-line-per-code catalog listing, used in the prompt so the model sees real options. */
export function formatCostCodeCatalog(costCodes: readonly CostCodeOption[]): string {
  return costCodes.map((code) => `${code.id} | ${code.code} | ${code.name} | ${code.defaultCostType}`).join("\n");
}

export interface MaterialCatalogOption {
  readonly vendor: string;
  readonly description: string;
  readonly unit: string;
  readonly unitCostCents: Cents;
}

/** A one-line-per-item materials listing, used in the prompt as the first-choice price source. */
export function formatMaterialCatalog(materials: readonly MaterialCatalogOption[]): string {
  if (materials.length === 0) return "(no materials catalog entries yet)";
  return materials
    .map((item) => `${item.vendor} | ${item.description} | ${item.unit} | $${(item.unitCostCents / 100).toFixed(2)}`)
    .join("\n");
}
