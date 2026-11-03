/**
 * Org-level estimating defaults (Handoff parity CR P1 #1).
 *
 * WCI locks estimates/proposals at 40% markup unless an admin opens
 * Organization.allowPerLineRateOverride. AI drafts and create_proposal_for_lead
 * always land on these defaults — never the model's guessed ratePercent.
 */

import type { RateMode } from "@/generated/prisma/enums";
import type { BasisPoints } from "@/lib/money";

/** 40% markup in basis points. */
export const DEFAULT_ESTIMATE_MARKUP_BASIS_POINTS: BasisPoints = 4_000;

export const DEFAULT_ESTIMATE_RATE_MODE: RateMode = "MARKUP";

export interface OrgEstimateRateDefaults {
  readonly rateMode: RateMode;
  readonly defaultRateBasisPoints: BasisPoints;
  /** When false, callers may not persist a per-line rate that differs from the org default. */
  readonly allowPerLineRateOverride: boolean;
}

export const LOCKED_ORG_ESTIMATE_RATE_DEFAULTS: OrgEstimateRateDefaults = {
  rateMode: DEFAULT_ESTIMATE_RATE_MODE,
  defaultRateBasisPoints: DEFAULT_ESTIMATE_MARKUP_BASIS_POINTS,
  allowPerLineRateOverride: false,
};

/**
 * Resolve the rate a line should store. Without the admin override flag, every
 * line is forced to the org default (4000 MARKUP) regardless of what the AI or
 * API caller asked for.
 */
export function resolveLineRate(params: {
  readonly org: OrgEstimateRateDefaults;
  readonly rateMode?: RateMode | null;
  readonly rateBasisPoints?: BasisPoints | null;
}): { rateMode: RateMode; rateBasisPoints: BasisPoints } {
  if (!params.org.allowPerLineRateOverride) {
    return {
      rateMode: params.org.rateMode,
      rateBasisPoints: params.org.defaultRateBasisPoints,
    };
  }
  return {
    rateMode: params.rateMode ?? params.org.rateMode,
    rateBasisPoints: params.rateBasisPoints ?? params.org.defaultRateBasisPoints,
  };
}
