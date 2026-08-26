/**
 * Pure schema and normalization logic for AI-drafted estimates. No network calls, no
 * database — kept separate from src/lib/ai/estimate-assistant.ts so the conversion
 * arithmetic is unit-testable without mocking Claude.
 *
 * The core safety property lives in `buildLineItemSchema`: `costCodeId` is a Zod enum
 * built from the org's *actual* cost codes, so a hallucinated code is structurally
 * impossible in a schema-validated response — not just discouraged by a prompt.
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
  });
}

/** Build the full draft schema for one call, scoped to the org's cost code catalog. */
export function buildEstimateDraftSchema(costCodeIds: readonly string[]) {
  return z.object({
    title: z.string().trim().min(1).max(255),
    lineItems: z.array(buildLineItemSchema(costCodeIds)).min(1).max(100),
    assumptions: z
      .array(z.string().trim().max(500))
      .max(20)
      .describe("Assumptions made or gaps the estimator should confirm before this is sent to the client"),
  });
}

export type RawEstimateDraft = z.infer<ReturnType<typeof buildEstimateDraftSchema>>;
export type RawEstimateLineItem = RawEstimateDraft["lineItems"][number];

export interface NormalizedEstimateLine {
  readonly costCodeId: string;
  readonly title: string;
  readonly description: string | null;
  readonly quantityMilli: number;
  readonly unitCostCents: Cents;
  readonly rateMode: RateMode;
  readonly rateBasisPoints: BasisPoints;
  readonly confidence: "HIGH" | "MEDIUM" | "LOW";
}

export interface NormalizedEstimateDraft {
  readonly title: string;
  readonly lineItems: readonly NormalizedEstimateLine[];
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
    assumptions: raw.assumptions,
    lineItems: raw.lineItems.map((line) => normalizeLine(line)),
  };
}

function normalizeLine(line: RawEstimateLineItem): NormalizedEstimateLine {
  return {
    costCodeId: line.costCodeId,
    title: line.title,
    description: line.description ?? null,
    quantityMilli: Math.round(line.quantity * 1_000),
    unitCostCents: parseDollarsToCents(line.unitCostDollars),
    rateMode: line.rateMode,
    rateBasisPoints: parsePercentToBasisPoints(line.ratePercent),
    confidence: line.confidence,
  };
}

/** A one-line-per-code catalog listing, used in the prompt so the model sees real options. */
export function formatCostCodeCatalog(costCodes: readonly CostCodeOption[]): string {
  return costCodes.map((code) => `${code.id} | ${code.code} | ${code.name} | ${code.defaultCostType}`).join("\n");
}
