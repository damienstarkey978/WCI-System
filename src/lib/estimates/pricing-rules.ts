/**
 * Org pricing rules that feed AI drafts (Handoff parity CR P1 #3).
 * Pure functions — money in integer cents, units via EstimateUnit.
 *
 * Rules (Damien / Estimating):
 * - Roofing: $85/SQ tear-off+install; SQ quantity only from Roofr
 * - Windows: $250 new opening / $300 R&R EA; $150 only New Construction
 * - Drywall: $40/sheet only New Construction or gutted-to-studs
 */

import type { BasisPoints, Cents } from "@/lib/money";
import type { EstimateUnit } from "@/lib/estimates/units";
import { tryNormalizeEstimateUnit } from "@/lib/estimates/units";

export const ROOFING_TEAROFF_INSTALL_CENTS_PER_SQ: Cents = 8_500;
export const WINDOW_NEW_OPENING_CENTS: Cents = 25_000;
export const WINDOW_RR_CENTS: Cents = 30_000;
export const WINDOW_NEW_CONSTRUCTION_CENTS: Cents = 15_000;
export const DRYWALL_SHEET_CENTS: Cents = 4_000;

export type PermitWorkTypeValue =
  | "NEW_CONSTRUCTION"
  | "ALTERATIONS_AND_REPAIRS"
  | "ADDITION"
  | "DEMOLITION"
  | "OTHER";

export type PricingRuleKind = "ROOFING" | "WINDOW" | "DRYWALL";

export interface PricingRuleMatch {
  readonly kind: PricingRuleKind;
  readonly unit: EstimateUnit;
  readonly unitCostCents: Cents;
  readonly priceSource: "RULE";
  readonly label: string;
  /** When true, quantity must come from Roofr (or be left for human). */
  readonly quantityFromRoofrOnly?: boolean;
  readonly reason: string;
}

export interface PricingRuleContext {
  readonly permitWorkType?: PermitWorkTypeValue | null;
  readonly notes?: string | null;
  readonly title?: string | null;
  readonly description?: string | null;
  readonly groupLabel?: string | null;
  readonly costCodeName?: string | null;
  readonly costCodeCode?: string | null;
  /** Explicit window subtype when known. */
  readonly windowKind?: "NEW_OPENING" | "RR" | null;
  /** True when notes/photos say gutted to studs. */
  readonly guttedToStuds?: boolean;
  /** True when a Roofr takeoff quantity is available for roofing. */
  readonly hasRoofrQuantity?: boolean;
}

function haystack(ctx: PricingRuleContext): string {
  return [ctx.title, ctx.description, ctx.groupLabel, ctx.costCodeName, ctx.costCodeCode, ctx.notes]
    .filter(Boolean)
    .join(" ");
}

function isGuttedToStuds(ctx: PricingRuleContext): boolean {
  if (ctx.guttedToStuds) return true;
  return /gutted?\s+to\s+studs|studs?\s+out|gut\s+to\s+stud/i.test(haystack(ctx));
}

function detectWindowKind(ctx: PricingRuleContext): "NEW_OPENING" | "RR" | null {
  if (ctx.windowKind) return ctx.windowKind;
  const text = haystack(ctx);
  if (/new\s+opening|cut\s+in|new\s+window\s+opening/i.test(text)) return "NEW_OPENING";
  if (/\br\s*&\s*r\b|\brr\b|remove\s*(and|&)\s*replace|replacement/i.test(text)) return "RR";
  return null;
}

/** Resolve the pricing rule that should apply to a line, if any. */
export function matchPricingRule(ctx: PricingRuleContext): PricingRuleMatch | null {
  const text = haystack(ctx);

  if (/\broof|\broofr|\bsq\b/i.test(text) && /tear[\s-]?off|install|roofing/i.test(text)) {
    return {
      kind: "ROOFING",
      unit: "SQ",
      unitCostCents: ROOFING_TEAROFF_INSTALL_CENTS_PER_SQ,
      priceSource: "RULE",
      label: "Roof tear-off + install",
      quantityFromRoofrOnly: true,
      reason: "Roofing priced at $85/SQ (tear-off + install); SQ from Roofr only.",
    };
  }

  if (/\bwindow|\bdoor/i.test(text)) {
    if (ctx.permitWorkType === "NEW_CONSTRUCTION") {
      return {
        kind: "WINDOW",
        unit: "EA",
        unitCostCents: WINDOW_NEW_CONSTRUCTION_CENTS,
        priceSource: "RULE",
        label: "Window/door — new construction",
        reason: "New Construction window/door rate $150/EA.",
      };
    }
    const kind = detectWindowKind(ctx) ?? "RR";
    if (kind === "NEW_OPENING") {
      return {
        kind: "WINDOW",
        unit: "EA",
        unitCostCents: WINDOW_NEW_OPENING_CENTS,
        priceSource: "RULE",
        label: "Window — new opening",
        reason: "New opening window rate $250/EA.",
      };
    }
    return {
      kind: "WINDOW",
      unit: "EA",
      unitCostCents: WINDOW_RR_CENTS,
      priceSource: "RULE",
      label: "Window — R&R",
      reason: "R&R window rate $300/EA.",
    };
  }

  if (/\bdrywall|\bsheetrock|\bgypsum/i.test(text)) {
    const allowed =
      ctx.permitWorkType === "NEW_CONSTRUCTION" ||
      ctx.permitWorkType === "ADDITION" ||
      isGuttedToStuds(ctx);
    if (!allowed) {
      return null;
    }
    return {
      kind: "DRYWALL",
      unit: "SHEET",
      unitCostCents: DRYWALL_SHEET_CENTS,
      priceSource: "RULE",
      label: "Drywall sheet",
      reason: "Drywall $40/SHEET (New Construction / addition / gutted-to-studs).",
    };
  }

  return null;
}

export interface ApplyPricingRuleInput {
  readonly title: string;
  readonly description?: string | null;
  readonly groupLabel?: string | null;
  readonly costCodeName?: string | null;
  readonly costCodeCode?: string | null;
  readonly unit?: string | null;
  readonly unitCostCents: Cents;
  readonly priceSource?: string | null;
  readonly permitWorkType?: PermitWorkTypeValue | null;
  readonly notes?: string | null;
  readonly hasRoofrQuantity?: boolean;
}

export interface ApplyPricingRuleResult {
  readonly unit: string | null;
  readonly unitCostCents: Cents;
  readonly priceSource: "RULE" | "COST_DB" | "CATALOG" | "MARKET_RATE" | "MANUAL" | null;
  readonly appliedRule: PricingRuleMatch | null;
  readonly warnings: readonly string[];
}

/**
 * Apply org pricing rules onto a draft line. Prefer RULE over the model's
 * MARKET_RATE. Does not invent quantities — roofing SQ still needs Roofr.
 */
export function applyPricingRuleToLine(input: ApplyPricingRuleInput): ApplyPricingRuleResult {
  const rule = matchPricingRule({
    permitWorkType: input.permitWorkType,
    notes: input.notes,
    title: input.title,
    description: input.description,
    groupLabel: input.groupLabel,
    costCodeName: input.costCodeName,
    costCodeCode: input.costCodeCode,
    hasRoofrQuantity: input.hasRoofrQuantity,
  });

  if (!rule) {
    const unit = tryNormalizeEstimateUnit(input.unit);
    return {
      unit,
      unitCostCents: input.unitCostCents,
      priceSource: (input.priceSource as ApplyPricingRuleResult["priceSource"]) ?? null,
      appliedRule: null,
      warnings: [],
    };
  }

  const warnings: string[] = [];
  if (rule.quantityFromRoofrOnly && !input.hasRoofrQuantity) {
    warnings.push("Roof SQ quantity must come from Roofr — leave qty for human/Roofr import.");
  }

  return {
    unit: rule.unit,
    unitCostCents: rule.unitCostCents,
    priceSource: "RULE",
    appliedRule: rule,
    warnings,
  };
}

/** Prompt snippet so the model sees the locked rules before drafting. */
export function formatPricingRulesForPrompt(permitWorkType?: PermitWorkTypeValue | null): string {
  const work = permitWorkType ?? "ALTERATIONS_AND_REPAIRS";
  return [
    "Company pricing rules (must follow; mark priceSource accordingly — prefer RULE over MARKET_RATE):",
    `- Permit work type for this job/lead: ${work}`,
    `- Roofing tear-off + install: $${(ROOFING_TEAROFF_INSTALL_CENTS_PER_SQ / 100).toFixed(2)}/SQ — SQ quantity ONLY from Roofr`,
    `- Windows (Alterations & Repairs / typical remodel): new opening $${(WINDOW_NEW_OPENING_CENTS / 100).toFixed(0)}/EA; R&R $${(WINDOW_RR_CENTS / 100).toFixed(0)}/EA`,
    `- Windows (New Construction only): $${(WINDOW_NEW_CONSTRUCTION_CENTS / 100).toFixed(0)}/EA`,
    `- Drywall: $${(DRYWALL_SHEET_CENTS / 100).toFixed(0)}/SHEET only for New Construction, Addition, or gutted-to-studs — never hourly`,
    "- When a cost-code catalog default unit/unitCost is given, use it and mark priceSource COST_DB (or CATALOG for materials catalog).",
  ].join("\n");
}

/** Demo helper for the CR test: 2 new openings + 2 R&R windows. */
export function windowRuleUnitCostsForTest(permitWorkType: PermitWorkTypeValue = "ALTERATIONS_AND_REPAIRS"): {
  readonly newOpeningCents: Cents;
  readonly rrCents: Cents;
} {
  if (permitWorkType === "NEW_CONSTRUCTION") {
    return { newOpeningCents: WINDOW_NEW_CONSTRUCTION_CENTS, rrCents: WINDOW_NEW_CONSTRUCTION_CENTS };
  }
  return { newOpeningCents: WINDOW_NEW_OPENING_CENTS, rrCents: WINDOW_RR_CENTS };
}

export type { BasisPoints };
