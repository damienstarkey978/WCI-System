/**
 * Estimate line kinds (Handoff parity CR P1 #12).
 * ALLOWANCE — priced, marked up, in totals.
 * OWNER_SUPPLIED — $0 material, excluded from totals, Owner-Supplied Materials section.
 * Mutual exclusion: a line cannot be both.
 */

import type { Cents } from "@/lib/money";

export type EstimateLineKindValue = "STANDARD" | "ALLOWANCE" | "OWNER_SUPPLIED";

export class MutualLineKindError extends Error {
  constructor() {
    super("A line cannot be both ALLOWANCE and OWNER_SUPPLIED.");
    this.name = "MutualLineKindError";
  }
}

export function normalizeLineKind(raw?: string | null): EstimateLineKindValue {
  const upper = raw?.trim().toUpperCase();
  if (!upper || upper === "STANDARD") return "STANDARD";
  if (upper === "ALLOWANCE") return "ALLOWANCE";
  if (upper === "OWNER_SUPPLIED" || upper === "OWNER-SUPPLIED" || upper === "OWNERSUPPLIED") {
    return "OWNER_SUPPLIED";
  }
  return "STANDARD";
}

export function assertLineKindExclusive(flags: {
  readonly allowance?: boolean;
  readonly ownerSupplied?: boolean;
  readonly lineKind?: string | null;
}): EstimateLineKindValue {
  const fromKind = normalizeLineKind(flags.lineKind);
  const allowance = flags.allowance === true || fromKind === "ALLOWANCE";
  const ownerSupplied = flags.ownerSupplied === true || fromKind === "OWNER_SUPPLIED";
  if (allowance && ownerSupplied) throw new MutualLineKindError();
  if (ownerSupplied) return "OWNER_SUPPLIED";
  if (allowance) return "ALLOWANCE";
  return fromKind;
}

/** Owner-supplied materials are $0 and never contribute to client totals. */
export function applyLineKindPricing(params: {
  readonly lineKind: EstimateLineKindValue;
  readonly unitCostCents: Cents;
  readonly builderCostCents: Cents;
  readonly clientTotalCents: Cents;
}): {
  readonly unitCostCents: Cents;
  readonly builderCostCents: Cents;
  readonly clientTotalCents: Cents;
  readonly includeInTotals: boolean;
  readonly groupLabelOverride?: string;
} {
  if (params.lineKind === "OWNER_SUPPLIED") {
    return {
      unitCostCents: 0,
      builderCostCents: 0,
      clientTotalCents: 0,
      includeInTotals: false,
      groupLabelOverride: "Owner-Supplied Materials",
    };
  }
  return {
    unitCostCents: params.unitCostCents,
    builderCostCents: params.builderCostCents,
    clientTotalCents: params.clientTotalCents,
    includeInTotals: true,
  };
}

export function isAllowanceUnit(unit: string | null | undefined): boolean {
  return unit?.trim().toUpperCase() === "ALLOWANCE";
}
