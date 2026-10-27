import { db } from "@/lib/db";

/**
 * Buildertrend's "(Auto Assign)" — next zero-padded 4-digit PO number for the org.
 * Scans existing numeric poNumbers and returns max+1 (or "0001" when none).
 * Non-numeric legacy numbers are ignored so they don't break sequencing.
 */
export async function nextAutoPoNumber(organizationId: string): Promise<string> {
  const existing = await db.purchaseOrder.findMany({
    where: { organizationId },
    select: { poNumber: true },
  });

  let max = 0;
  for (const row of existing) {
    const trimmed = row.poNumber.trim();
    if (!/^\d+$/.test(trimmed)) continue;
    const value = Number.parseInt(trimmed, 10);
    if (Number.isFinite(value) && value > max) max = value;
  }

  return String(max + 1).padStart(4, "0");
}
