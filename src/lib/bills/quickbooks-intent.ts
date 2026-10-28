/**
 * Bill → QuickBooks send intent.
 *
 * Business rule (Damien): materials do not go to QuickBooks; only labor (or
 * unpaid services / subcontract) should. Staff must confirm send vs skip when
 * marking READY_FOR_PAYMENT — never silently push every bill.
 */

import { CostType } from "@/generated/prisma/enums";

/** Cost types that are eligible to push to QuickBooks. */
const QB_ELIGIBLE_COST_TYPES: ReadonlySet<CostType> = new Set([CostType.LABOR, CostType.SUBCONTRACTOR]);

/** Cost types treated as materials / goods — default skip. */
const QB_MATERIAL_COST_TYPES: ReadonlySet<CostType> = new Set([CostType.MATERIAL, CostType.EQUIPMENT]);

export const DEFAULT_MATERIALS_SKIP_REASON = "Materials — not sent to QuickBooks";

export interface BillLineCostTypeInput {
  readonly costType: CostType | string;
  readonly amountCents: number;
}

export interface QuickBooksSendSuggestion {
  /** Default the UI / API callers should pre-select. */
  readonly suggestedSend: boolean;
  /** Short explanation shown next to the control. */
  readonly reason: string;
  readonly eligibleCents: number;
  readonly materialCents: number;
  readonly otherCents: number;
  readonly totalCents: number;
}

function asCostType(value: CostType | string): CostType {
  if (value in CostType) return value as CostType;
  return CostType.NONE;
}

/**
 * Suggest whether a bill should go to QuickBooks from its line cost types.
 * Material-only or material-heavy (≥ eligible labor/services cents) → skip;
 * otherwise (labor/services present and not dominated by materials) → send.
 */
export function suggestSendToQuickBooks(lineItems: readonly BillLineCostTypeInput[]): QuickBooksSendSuggestion {
  let eligibleCents = 0;
  let materialCents = 0;
  let otherCents = 0;

  for (const line of lineItems) {
    const costType = asCostType(line.costType);
    const amount = Math.max(0, line.amountCents);
    if (QB_ELIGIBLE_COST_TYPES.has(costType)) eligibleCents += amount;
    else if (QB_MATERIAL_COST_TYPES.has(costType)) materialCents += amount;
    else otherCents += amount;
  }

  const totalCents = eligibleCents + materialCents + otherCents;

  if (totalCents === 0) {
    return {
      suggestedSend: false,
      reason: "No line amounts — leave QuickBooks off until costs are entered.",
      eligibleCents,
      materialCents,
      otherCents,
      totalCents,
    };
  }

  if (materialCents > 0 && eligibleCents === 0) {
    return {
      suggestedSend: false,
      reason: "Material-only lines — materials are not sent to QuickBooks.",
      eligibleCents,
      materialCents,
      otherCents,
      totalCents,
    };
  }

  if (materialCents >= eligibleCents && materialCents > 0) {
    return {
      suggestedSend: false,
      reason: "Material-heavy bill — skip QuickBooks unless this is unpaid labor/services.",
      eligibleCents,
      materialCents,
      otherCents,
      totalCents,
    };
  }

  if (eligibleCents > 0) {
    return {
      suggestedSend: true,
      reason: "Labor/services lines are eligible — send to QuickBooks when ready for payment.",
      eligibleCents,
      materialCents,
      otherCents,
      totalCents,
    };
  }

  return {
    suggestedSend: false,
    reason: "No labor/services cost types — skip QuickBooks unless you know this should post there.",
    eligibleCents,
    materialCents,
    otherCents,
    totalCents,
  };
}

export function defaultSkipReasonForSuggestion(suggestion: QuickBooksSendSuggestion): string {
  if (!suggestion.suggestedSend && suggestion.materialCents > 0) return DEFAULT_MATERIALS_SKIP_REASON;
  if (!suggestion.suggestedSend) return "Skipped QuickBooks at ready-for-payment";
  return DEFAULT_MATERIALS_SKIP_REASON;
}

/** True when an explicit opt-out blocks a QuickBooks bill create/update. */
export function isBillQuickBooksSyncBlocked(sendToQuickBooks: boolean | null | undefined): boolean {
  return sendToQuickBooks === false;
}
