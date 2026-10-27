/**
 * Unit-of-measure helpers for the Handoff-style estimate spreadsheet.
 * AI drafts often supply a unit; when missing, fall back by cost type.
 */

const COST_TYPE_DEFAULT_UNIT: Record<string, string> = {
  LABOR: "hr",
  MATERIAL: "ea",
  EQUIPMENT: "ea",
  SUBCONTRACTOR: "ls",
  OTHER: "ea",
  NONE: "ea",
};

export function resolveLineUnit(unit: string | null | undefined, costType: string): string {
  const trimmed = unit?.trim();
  if (trimmed) return trimmed;
  return COST_TYPE_DEFAULT_UNIT[costType] ?? "ea";
}

/** Format qty + unit for client "Quantities at a glance" bullets. */
export function formatQuantityGlance(quantityMilli: number, unit: string): string {
  const qty = quantityMilli / 1_000;
  const qtyLabel = qty.toLocaleString("en-US", { maximumFractionDigits: 3 });
  return `${qtyLabel} ${unit}`;
}
