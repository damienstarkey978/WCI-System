/**
 * Pure schema and normalization logic for AI-extracted receipt/bill data. No network
 * calls, no database — mirrors src/lib/ai/estimate-draft.ts's split so the conversion
 * arithmetic is unit-testable without mocking Claude.
 *
 * Same core safety property as the estimate drafter: `costCodeId` is a Zod enum built
 * from the org's *actual* cost codes, so a hallucinated code is structurally
 * impossible in a schema-validated response.
 */

import { z } from "zod";

import { parseDollarsToCents, type Cents } from "@/lib/money";
import { EmptyCostCodeCatalogError } from "@/lib/ai/estimate-draft";

export { EmptyCostCodeCatalogError, formatCostCodeCatalog, type CostCodeOption } from "@/lib/ai/estimate-draft";

/** Build the per-line schema, constraining costCodeId to the given catalog. */
export function buildBillOcrLineItemSchema(costCodeIds: readonly string[]) {
  if (costCodeIds.length === 0) {
    throw new EmptyCostCodeCatalogError();
  }
  const [first, ...rest] = costCodeIds;
  return z.object({
    costCodeId: z
      .enum([first, ...rest])
      .describe("Must be exactly one of the provided cost code ids. Never invent a new one."),
    title: z.string().trim().min(1).max(255).describe("What this line item is, e.g. '2x4x8 lumber' or 'Delivery fee'"),
    amountDollars: z.number().positive().max(1_000_000).describe("This line's amount in dollars"),
  });
}

/** Build the full extraction schema for one call, scoped to the org's cost code catalog. */
export function buildBillOcrSchema(costCodeIds: readonly string[]) {
  return z.object({
    vendorName: z.string().trim().min(1).max(255).describe("The vendor/supplier name printed on the document"),
    billNumber: z.string().trim().max(64).nullable().describe("Invoice/receipt number, if printed. Null if absent."),
    issuedOn: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .nullable()
      .describe("The document's date in YYYY-MM-DD, if printed. Null if absent or illegible."),
    lineItems: z.array(buildBillOcrLineItemSchema(costCodeIds)).min(1).max(100),
    assumptions: z
      .array(z.string().trim().max(500))
      .max(20)
      .describe("Anything illegible, ambiguous, or inferred that the reviewer should double-check before approving this bill"),
  });
}

export type RawBillOcrExtraction = z.infer<ReturnType<typeof buildBillOcrSchema>>;
export type RawBillOcrLineItem = RawBillOcrExtraction["lineItems"][number];

export interface NormalizedBillOcrLineItem {
  readonly costCodeId: string;
  readonly title: string;
  readonly amountCents: Cents;
}

export interface NormalizedBillOcrExtraction {
  readonly vendorName: string;
  readonly billNumber: string | null;
  readonly issuedOn: Date | null;
  readonly lineItems: readonly NormalizedBillOcrLineItem[];
  readonly assumptions: readonly string[];
}

/**
 * Convert the AI's dollars output into the integer cents the rest of the system
 * uses (CLAUDE.md 5) — the one place a float from the model touches money.
 */
export function normalizeBillOcrExtraction(raw: RawBillOcrExtraction): NormalizedBillOcrExtraction {
  return {
    vendorName: raw.vendorName,
    billNumber: raw.billNumber,
    issuedOn: raw.issuedOn ? new Date(`${raw.issuedOn}T00:00:00.000Z`) : null,
    assumptions: raw.assumptions,
    lineItems: raw.lineItems.map((line) => ({
      costCodeId: line.costCodeId,
      title: line.title,
      amountCents: parseDollarsToCents(line.amountDollars),
    })),
  };
}
