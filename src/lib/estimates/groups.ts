/**
 * Estimate groups as objects with subtotals (Handoff parity CR P2 #15).
 * Derived from line groupLabel (and optional area) — not a parallel table yet.
 */

import { priceWithRate, extendedCostCents } from "@/lib/budget/funnel";
import type { RateMode } from "@/generated/prisma/enums";
import type { BasisPoints, Cents } from "@/lib/money";

export interface EstimateGroupLineInput {
  readonly id: string;
  readonly groupLabel?: string | null;
  readonly areaLabel?: string | null;
  readonly quantityMilli: number;
  readonly unitCostCents: Cents;
  readonly rateMode: RateMode;
  readonly rateBasisPoints: BasisPoints;
  readonly lineKind?: string | null;
  readonly sortOrder?: number;
}

export interface EstimateGroup {
  readonly id: string;
  readonly name: string;
  readonly order: number;
  readonly areaLabel: string | null;
  readonly lineIds: readonly string[];
  readonly builderCostCents: Cents;
  readonly clientSubtotalCents: Cents;
}

function slugifyGroupId(name: string, area: string | null): string {
  const base = `${area ? `${area}__` : ""}${name}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return base || "ungrouped";
}

/**
 * Collapse lines into ordered groups keyed by area + groupLabel.
 * OWNER_SUPPLIED lines stay in the group for structure but contribute $0.
 */
export function buildEstimateGroups(lines: readonly EstimateGroupLineInput[]): EstimateGroup[] {
  const buckets = new Map<
    string,
    {
      name: string;
      areaLabel: string | null;
      order: number;
      lineIds: string[];
      builderCostCents: number;
      clientSubtotalCents: number;
    }
  >();

  const sorted = [...lines].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  let nextOrder = 0;

  for (const line of sorted) {
    const name = line.groupLabel?.trim() || "Ungrouped";
    const areaLabel = line.areaLabel?.trim() || null;
    const id = slugifyGroupId(name, areaLabel);
    let bucket = buckets.get(id);
    if (!bucket) {
      bucket = {
        name,
        areaLabel,
        order: nextOrder++,
        lineIds: [],
        builderCostCents: 0,
        clientSubtotalCents: 0,
      };
      buckets.set(id, bucket);
    }
    bucket.lineIds.push(line.id);
    if (line.lineKind === "OWNER_SUPPLIED") continue;
    const builder = extendedCostCents(line.quantityMilli, line.unitCostCents);
    const client = priceWithRate(builder, line.rateMode, line.rateBasisPoints);
    bucket.builderCostCents += builder;
    bucket.clientSubtotalCents += client;
  }

  return [...buckets.values()]
    .sort((a, b) => a.order - b.order)
    .map((bucket) => ({
      id: slugifyGroupId(bucket.name, bucket.areaLabel),
      name: bucket.name,
      order: bucket.order,
      areaLabel: bucket.areaLabel,
      lineIds: bucket.lineIds,
      builderCostCents: bucket.builderCostCents,
      clientSubtotalCents: bucket.clientSubtotalCents,
    }));
}
