/**
 * Build Handy dock scope / pricing summaries from estimate spreadsheet groups.
 * Mirrors Handoff's trade bullets + Pricing & terms block (WCI data only — no invented rates).
 */

import { resolveLineUnit } from "@/lib/estimates/units";
import { formatMoney, formatPercent } from "@/lib/format";

import type { SpreadsheetGroup } from "@/components/estimates/EstimateSpreadsheet";
import type { HandyPricingTerms, HandyScopeGroup } from "@/components/estimates/EstimateHandyDock";

export function buildHandyScopeGroups(groups: readonly SpreadsheetGroup[]): HandyScopeGroup[] {
  return groups.map((group) => {
    const titles = group.items.map((item) => item.title);
    const summary =
      titles.length <= 3
        ? titles.join(" · ")
        : `${titles.slice(0, 2).join(" · ")} · +${titles.length - 2} more`;

    let laborMilli = 0;
    for (const item of group.items) {
      if (item.costType !== "LABOR") continue;
      const unit = resolveLineUnit(item.unit, item.costType).toLowerCase();
      if (unit === "hr" || unit === "hrs" || unit === "hour" || unit === "hours") {
        laborMilli += item.quantityMilli;
      }
    }
    const hoursLabel =
      laborMilli > 0
        ? `${(laborMilli / 1000).toLocaleString("en-US", { maximumFractionDigits: 1 })} hrs`
        : null;

    return {
      label: group.label,
      summary,
      hoursLabel,
      totalLabel: formatMoney(group.groupClientTotalCents),
      lineCount: group.items.length,
    };
  });
}

export function buildHandyPricingTerms(input: {
  readonly groups: readonly SpreadsheetGroup[];
  readonly totalClientCents: number;
  readonly totalBuilderCostCents: number;
  readonly lineItemCount: number;
}): HandyPricingTerms {
  const totalMarkupCents = input.totalClientCents - input.totalBuilderCostCents;
  const marginBasisPoints =
    input.totalClientCents > 0
      ? Math.round((totalMarkupCents / input.totalClientCents) * 10_000)
      : 0;

  const laborRates = new Map<number, number>();
  const markupSamples: number[] = [];
  for (const group of input.groups) {
    for (const item of group.items) {
      markupSamples.push(item.rateBasisPoints);
      if (item.costType === "LABOR" && item.unitCostCents > 0) {
        laborRates.set(item.unitCostCents, (laborRates.get(item.unitCostCents) ?? 0) + 1);
      }
    }
  }

  let laborRateLabel: string | null = null;
  if (laborRates.size > 0) {
    const [topRate] = [...laborRates.entries()].sort((a, b) => b[1] - a[1])[0];
    laborRateLabel = `${formatMoney(topRate)}/hr`;
  }

  let typicalMarkupLabel: string | null = null;
  if (markupSamples.length > 0) {
    const avg = Math.round(markupSamples.reduce((s, n) => s + n, 0) / markupSamples.length);
    typicalMarkupLabel = formatPercent(avg);
  }

  return {
    totalLabel: formatMoney(input.totalClientCents),
    costLabel: formatMoney(input.totalBuilderCostCents),
    markupLabel: formatMoney(totalMarkupCents),
    marginLabel: formatPercent(marginBasisPoints),
    lineItemCount: input.lineItemCount,
    laborRateLabel,
    typicalMarkupLabel,
    notes: "Nothing sends until you Convert → Proposal and send.",
  };
}
