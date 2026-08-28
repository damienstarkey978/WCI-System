import { MoneyError, parseDollarsToCents } from "@/lib/money";

export interface ParsedCostCodeLineItem {
  readonly costCodeId: string;
  readonly title: string;
  readonly quantityMilli: number;
  readonly unitCostCents: number;
}

/**
 * Zips the parallel form arrays produced by CostCodeLineItems (lineCostCodeId[],
 * lineTitle[], lineQuantity[], lineUnitCost[]) back into row objects, dropping any
 * row missing a cost code, title, or unit cost — the client only guarantees those
 * are `required` per-row, not that a stray blank row can't be submitted.
 */
export function parseCostCodeLineItems(formData: FormData): ParsedCostCodeLineItem[] {
  const costCodeIds = formData.getAll("lineCostCodeId").map(String);
  const titles = formData.getAll("lineTitle").map(String);
  const quantities = formData.getAll("lineQuantity").map(String);
  const unitCosts = formData.getAll("lineUnitCost").map(String);

  const rows: ParsedCostCodeLineItem[] = [];
  for (let index = 0; index < costCodeIds.length; index++) {
    const costCodeId = costCodeIds[index]?.trim();
    const title = titles[index]?.trim();
    const unitCostRaw = unitCosts[index]?.trim();
    if (!costCodeId || !title || !unitCostRaw) continue;

    const quantityRaw = quantities[index]?.trim() || "1";
    const quantityMilli = Math.round(Number(quantityRaw) * 1000);
    if (!Number.isFinite(quantityMilli) || quantityMilli <= 0) {
      throw new MoneyError(`Cannot parse "${quantityRaw}" as a quantity`);
    }

    rows.push({
      costCodeId,
      title,
      quantityMilli,
      unitCostCents: parseDollarsToCents(unitCostRaw),
    });
  }
  return rows;
}
