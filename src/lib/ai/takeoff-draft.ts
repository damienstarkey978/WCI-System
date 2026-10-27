/**
 * Pure schema + normalization for AI-drafted takeoffs. No network / DB — unit-testable
 * without mocking Claude. costCodeId is a Zod enum from the org catalog so a
 * hallucinated code cannot pass schema validation.
 */

import { z } from "zod";

import { parseDollarsToCents, type Cents } from "@/lib/money";

export interface CostCodeOption {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly defaultCostType: string;
}

export class EmptyCostCodeCatalogError extends Error {
  constructor() {
    super("Cannot draft a takeoff with no cost codes in the organization's catalog.");
    this.name = "EmptyCostCodeCatalogError";
  }
}

export function buildTakeoffLineSchema(costCodeIds: readonly string[]) {
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
      .describe("Trade / assembly grouping, e.g. 'Framing', 'Flooring', 'Stucco'."),
    title: z
      .string()
      .trim()
      .min(1)
      .max(255)
      .describe("Purchasing-facing line title, e.g. 'LVP flooring — main level'."),
    description: z
      .string()
      .trim()
      .max(1_000)
      .nullish()
      .describe("Measurement detail: rooms, dimensions, waste factor, SKU notes."),
    quantity: z.number().positive().max(1_000_000).describe("Measured quantity in the unit below"),
    unit: z
      .string()
      .trim()
      .min(1)
      .max(40)
      .describe("Unit of measure: sqft, lf, ea, cy, sheet, etc."),
    unitCostDollars: z
      .number()
      .min(0)
      .max(10_000_000)
      .describe("Optional estimated unit cost in dollars for purchasing guidance (0 if unknown)"),
    confidence: z.enum(["HIGH", "MEDIUM", "LOW"]).describe("Confidence in the quantity measurement"),
  });
}

export function buildTakeoffDraftSchema(costCodeIds: readonly string[]) {
  return z.object({
    title: z.string().trim().min(1).max(255).describe("Short takeoff title for this job"),
    lineItems: z
      .array(buildTakeoffLineSchema(costCodeIds))
      .min(1)
      .max(80)
      .describe("Measured material/labor quantity lines mapped to cost codes"),
    assumptions: z
      .array(z.string().trim().max(500))
      .max(20)
      .describe("Assumptions, missing dimensions, or items the PM should verify on plans"),
  });
}

export type RawTakeoffDraft = z.infer<ReturnType<typeof buildTakeoffDraftSchema>>;
export type RawTakeoffLineItem = RawTakeoffDraft["lineItems"][number];

export interface NormalizedTakeoffLine {
  readonly costCodeId: string;
  readonly groupLabel: string;
  readonly title: string;
  readonly description: string | null;
  readonly quantityMilli: number;
  readonly unit: string;
  readonly unitCostCents: Cents;
  readonly confidence: "HIGH" | "MEDIUM" | "LOW";
}

export interface NormalizedTakeoffDraft {
  readonly title: string;
  readonly lineItems: readonly NormalizedTakeoffLine[];
  readonly assumptions: readonly string[];
}

export function formatCostCodeCatalog(costCodes: readonly CostCodeOption[]): string {
  return costCodes.map((code) => `- ${code.id} | ${code.code} | ${code.name} (${code.defaultCostType})`).join("\n");
}

export function normalizeTakeoffDraft(raw: RawTakeoffDraft): NormalizedTakeoffDraft {
  return {
    title: raw.title,
    assumptions: raw.assumptions,
    lineItems: raw.lineItems.map((line) => ({
      costCodeId: line.costCodeId,
      groupLabel: line.groupLabel,
      title: line.title,
      description: line.description?.trim() ? line.description.trim() : null,
      quantityMilli: Math.round(line.quantity * 1_000),
      unit: line.unit,
      unitCostCents: parseDollarsToCents(line.unitCostDollars),
      confidence: line.confidence,
    })),
  };
}
