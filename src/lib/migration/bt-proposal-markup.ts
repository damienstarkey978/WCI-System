/**
 * Buildertrend ProposalReport markup → WCI markup basis points.
 *
 * Markup Type "$" is dollar markup, not percent. Treating "$" as percent blew
 * Candlebark's budget to $824,917.77 (BT approved $84,430.80).
 */

export function markupBasisPointsFromProposalRow(row: Record<string, unknown>): number {
  const qty = Number(row["Quantity"] || 0);
  const unitCost = Number(row["Unit Cost"] || 0);
  const builderCost = Number(row["Builder Cost"] || 0) || unitCost * qty;
  const clientPrice = Number(row["Client Price"] || 0);
  const markup = Number(row["Markup"] || 0);
  const markupType = String(row["Markup Type"] ?? "")
    .trim()
    .toLowerCase();

  const costCents = Math.round(builderCost * 100);
  const priceCents = Math.round(clientPrice * 100);

  // Prefer Client Price — BT already computed the authoritative number.
  if (costCents > 0 && Number.isFinite(clientPrice)) {
    return Math.round((priceCents / costCents - 1) * 10_000);
  }

  if (markupType === "$") {
    if (costCents <= 0) return 0;
    return Math.round(((markup * 100) / costCents) * 10_000);
  }

  if (markupType === "margin") {
    const marginBps = Math.round(markup * 100);
    if (marginBps >= 10_000 || marginBps <= -10_000) return 0;
    return Math.round((marginBps / (10_000 - marginBps)) * 10_000);
  }

  // "%" or blank — Markup is already a percent (21 → 2100 bps).
  return Math.round(markup * 100);
}
