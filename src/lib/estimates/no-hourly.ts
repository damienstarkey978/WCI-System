/**
 * No-hourly-labor guard (Handoff parity CR P1 #2).
 *
 * Rejects LABOR + HR when the trade has a per-unit pricing rule (roof SQ,
 * window/door EA, drywall SHEET, stucco/insulation/paint/LVP/tile SF).
 */

import type { CostType } from "@/generated/prisma/enums";
import { tryNormalizeEstimateUnit, type EstimateUnit } from "@/lib/estimates/units";

export class HourlyLaborNotAllowedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HourlyLaborNotAllowedError";
  }
}

/** Trades that must be priced per-unit, never as LABOR hours. */
export const PER_UNIT_TRADE_PATTERNS: readonly {
  readonly match: RegExp;
  readonly preferredUnit: EstimateUnit;
  readonly label: string;
}[] = [
  { match: /\broof|\broofr|\bsq\b/i, preferredUnit: "SQ", label: "roofing" },
  { match: /\bwindow|\bdoor/i, preferredUnit: "EA", label: "windows/doors" },
  { match: /\bdrywall|\bsheetrock|\bgypsum/i, preferredUnit: "SHEET", label: "drywall" },
  { match: /\bstucco/i, preferredUnit: "SF", label: "stucco" },
  { match: /\binsulat/i, preferredUnit: "SF", label: "insulation" },
  { match: /\bpaint/i, preferredUnit: "SF", label: "paint" },
  { match: /\blvp|\bviny\s*plank|\bluxury\s*vinyl/i, preferredUnit: "SF", label: "LVP" },
  { match: /\btile/i, preferredUnit: "SF", label: "tile" },
];

export function findPerUnitTradeRule(text: string): (typeof PER_UNIT_TRADE_PATTERNS)[number] | null {
  for (const rule of PER_UNIT_TRADE_PATTERNS) {
    if (rule.match.test(text)) return rule;
  }
  return null;
}

export interface NoHourlyCheckInput {
  readonly costType: CostType | string;
  readonly unit?: string | null;
  readonly title?: string | null;
  readonly description?: string | null;
  readonly costCodeName?: string | null;
  readonly costCodeCode?: string | null;
  readonly groupLabel?: string | null;
}

/**
 * Throws HourlyLaborNotAllowedError when a LABOR line uses HR (or defaults to HR)
 * for a trade that has a per-unit rule.
 */
export function assertNoHourlyLaborForPerUnitTrade(input: NoHourlyCheckInput): void {
  if (input.costType !== "LABOR") return;

  const unit = tryNormalizeEstimateUnit(input.unit) ?? "HR";
  if (unit !== "HR") return;

  const haystack = [input.title, input.description, input.costCodeName, input.costCodeCode, input.groupLabel]
    .filter(Boolean)
    .join(" ");
  const rule = findPerUnitTradeRule(haystack);
  if (!rule) return;

  throw new HourlyLaborNotAllowedError(
    `Hourly labor is not allowed for ${rule.label} — use unit ${rule.preferredUnit} (got LABOR + HR).`,
  );
}
