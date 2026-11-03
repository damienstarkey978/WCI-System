/**
 * Unit-of-measure for estimate lines (Handoff parity CR P1 #5).
 * Canonical enum is uppercase; storage/API accept any case and normalize.
 */

import type { CostType } from "@/generated/prisma/enums";

export const ESTIMATE_UNITS = ["EA", "SF", "LF", "SQ", "SHEET", "LS", "HR", "ALLOWANCE"] as const;

export type EstimateUnit = (typeof ESTIMATE_UNITS)[number];

const UNIT_SET = new Set<string>(ESTIMATE_UNITS);

export class UnknownEstimateUnitError extends Error {
  constructor(public readonly raw: string) {
    super(`Unknown unit "${raw}". Allowed: ${ESTIMATE_UNITS.join(", ")}.`);
    this.name = "UnknownEstimateUnitError";
  }
}

const COST_TYPE_DEFAULT_UNIT: Record<CostType | string, EstimateUnit> = {
  LABOR: "HR",
  MATERIAL: "EA",
  EQUIPMENT: "EA",
  SUBCONTRACTOR: "LS",
  OTHER: "EA",
  NONE: "EA",
};

/** Normalize user/AI input to a canonical unit, or null when blank. */
export function normalizeEstimateUnit(unit: string | null | undefined): EstimateUnit | null {
  const trimmed = unit?.trim();
  if (!trimmed) return null;
  const upper = trimmed.toUpperCase();
  // Common aliases Handoff / field notes use
  const aliases: Record<string, EstimateUnit> = {
    HOUR: "HR",
    HOURS: "HR",
    HR: "HR",
    EACH: "EA",
    EA: "EA",
    SQFT: "SF",
    "SQ FT": "SF",
    SF: "SF",
    SQ: "SQ",
    SQUARE: "SQ",
    LF: "LF",
    LINFT: "LF",
    "LIN FT": "LF",
    SHEET: "SHEET",
    SHT: "SHEET",
    LS: "LS",
    LUMP: "LS",
    "LUMP SUM": "LS",
    ALLOWANCE: "ALLOWANCE",
    ALLOW: "ALLOWANCE",
  };
  const resolved = aliases[upper] ?? (UNIT_SET.has(upper) ? (upper as EstimateUnit) : null);
  if (!resolved) throw new UnknownEstimateUnitError(trimmed);
  return resolved;
}

/** Like normalizeEstimateUnit but returns null for unknown instead of throwing (AI soft path). */
export function tryNormalizeEstimateUnit(unit: string | null | undefined): EstimateUnit | null {
  try {
    return normalizeEstimateUnit(unit);
  } catch (error) {
    if (error instanceof UnknownEstimateUnitError) return null;
    throw error;
  }
}

export function resolveLineUnit(unit: string | null | undefined, costType: string): string {
  const normalized = tryNormalizeEstimateUnit(unit);
  if (normalized) return normalized;
  return COST_TYPE_DEFAULT_UNIT[costType] ?? "EA";
}

/** Format qty + unit for client "Quantities at a glance" bullets. */
export function formatQuantityGlance(quantityMilli: number, unit: string): string {
  const qty = quantityMilli / 1_000;
  const qtyLabel = qty.toLocaleString("en-US", { maximumFractionDigits: 3 });
  const displayUnit = tryNormalizeEstimateUnit(unit)?.toLowerCase() ?? unit;
  return `${qtyLabel} ${displayUnit}`;
}
