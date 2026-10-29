/**
 * Buildertrend ProposalReport Markup → WCI markupBasisPoints.
 *
 * Markup Type "$" is dollar markup, not percent. Treating "$" as percent blew
 * Candlebark's revised price to $824,917.77 vs BT $84,430.80. Prefer Client Price
 * / Builder Cost when both are present; otherwise honor $/\%/Margin.
 */

export function markupBasisPointsFromProposalRow(row: Record<string, unknown>): number {
  const cost = Number(row["Builder Cost"] ?? row["Unit Cost"] ?? 0);
  const client = Number(row["Client Price"] || 0);
  const markup = Number(row["Markup"] || 0);
  const mt = String(row["Markup Type"] ?? "").trim();

  if (cost > 0 && client > 0) {
    return Math.round(((client - cost) / cost) * 10_000);
  }

  if (mt === "$" || mt.toLowerCase() === "dollar") {
    if (cost <= 0) return 0;
    return Math.round((markup / cost) * 10_000);
  }

  if (mt.toLowerCase() === "margin") {
    // Margin % of client price → cost markup bps: m/(100-m)*10000
    if (markup >= 100) return 0;
    return Math.round((markup / (100 - markup)) * 10_000);
  }

  // Default / "%": Markup is already a percent
  return Math.round(markup * 100);
}
