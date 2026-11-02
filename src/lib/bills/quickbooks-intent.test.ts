import { describe, expect, it } from "vitest";

import { BillApprovalStatus, CostType } from "@/generated/prisma/enums";

import {
  DEFAULT_MATERIALS_SKIP_REASON,
  defaultSkipReasonForSuggestion,
  isBillQuickBooksPushUnsafeByStatus,
  isBillQuickBooksSyncBlocked,
  suggestSendToQuickBooks,
} from "./quickbooks-intent";

describe("suggestSendToQuickBooks", () => {
  it("suggests skip for material-only bills", () => {
    const suggestion = suggestSendToQuickBooks([
      { costType: CostType.MATERIAL, amountCents: 12_500 },
      { costType: CostType.EQUIPMENT, amountCents: 2_500 },
    ]);
    expect(suggestion.suggestedSend).toBe(false);
    expect(suggestion.materialCents).toBe(15_000);
    expect(suggestion.eligibleCents).toBe(0);
    expect(suggestion.reason).toMatch(/Material-only/i);
    expect(defaultSkipReasonForSuggestion(suggestion)).toBe(DEFAULT_MATERIALS_SKIP_REASON);
  });

  it("suggests send when labor/services dominate", () => {
    const suggestion = suggestSendToQuickBooks([
      { costType: CostType.LABOR, amountCents: 40_000 },
      { costType: CostType.SUBCONTRACTOR, amountCents: 10_000 },
      { costType: CostType.MATERIAL, amountCents: 5_000 },
    ]);
    expect(suggestion.suggestedSend).toBe(true);
    expect(suggestion.eligibleCents).toBe(50_000);
    expect(suggestion.reason).toMatch(/Labor\/services/i);
  });

  it("suggests skip when material-heavy even if some labor exists", () => {
    const suggestion = suggestSendToQuickBooks([
      { costType: CostType.MATERIAL, amountCents: 80_000 },
      { costType: CostType.LABOR, amountCents: 20_000 },
    ]);
    expect(suggestion.suggestedSend).toBe(false);
    expect(suggestion.reason).toMatch(/Material-heavy/i);
  });

  it("suggests skip when lines have no labor/services cost types", () => {
    const suggestion = suggestSendToQuickBooks([{ costType: CostType.OTHER, amountCents: 9_000 }]);
    expect(suggestion.suggestedSend).toBe(false);
    expect(suggestion.otherCents).toBe(9_000);
  });
});

describe("isBillQuickBooksSyncBlocked", () => {
  it("blocks only an explicit false opt-out", () => {
    expect(isBillQuickBooksSyncBlocked(false)).toBe(true);
    expect(isBillQuickBooksSyncBlocked(true)).toBe(false);
    expect(isBillQuickBooksSyncBlocked(null)).toBe(false);
    expect(isBillQuickBooksSyncBlocked(undefined)).toBe(false);
  });
});

describe("isBillQuickBooksPushUnsafeByStatus", () => {
  it("blocks PAID and VOID bills", () => {
    expect(isBillQuickBooksPushUnsafeByStatus({ approvalStatus: BillApprovalStatus.PAID })).toBe(true);
    expect(isBillQuickBooksPushUnsafeByStatus({ approvalStatus: BillApprovalStatus.VOID })).toBe(true);
    expect(isBillQuickBooksPushUnsafeByStatus({ approvalStatus: "PAID" })).toBe(true);
  });

  it("blocks when paidAt is set even if status is not PAID", () => {
    expect(
      isBillQuickBooksPushUnsafeByStatus({
        approvalStatus: BillApprovalStatus.READY_FOR_PAYMENT,
        paidAt: new Date("2026-01-01"),
      }),
    ).toBe(true);
  });

  it("allows unpaid in-funnel statuses without paidAt", () => {
    expect(isBillQuickBooksPushUnsafeByStatus({ approvalStatus: BillApprovalStatus.READY_FOR_PAYMENT })).toBe(false);
    expect(isBillQuickBooksPushUnsafeByStatus({ approvalStatus: BillApprovalStatus.APPROVED, paidAt: null })).toBe(
      false,
    );
  });
});
