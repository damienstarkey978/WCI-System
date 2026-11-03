import { describe, expect, it } from "vitest";

import {
  applyPricingRuleToLine,
  DRYWALL_SHEET_CENTS,
  matchPricingRule,
  ROOFING_TEAROFF_INSTALL_CENTS_PER_SQ,
  WINDOW_NEW_OPENING_CENTS,
  WINDOW_RR_CENTS,
  windowRuleUnitCostsForTest,
} from "@/lib/estimates/pricing-rules";

describe("pricing rules (Handoff parity P1 #3)", () => {
  it("prices 2×$250 new opening + 2×$300 R&R windows for Alterations & Repairs", () => {
    const { newOpeningCents, rrCents } = windowRuleUnitCostsForTest("ALTERATIONS_AND_REPAIRS");
    expect(newOpeningCents).toBe(WINDOW_NEW_OPENING_CENTS);
    expect(rrCents).toBe(WINDOW_RR_CENTS);

    const openings = [1, 2].map(() =>
      applyPricingRuleToLine({
        title: "Window — new opening",
        description: "Cut-in new opening",
        unitCostCents: 99_999,
        permitWorkType: "ALTERATIONS_AND_REPAIRS",
      }),
    );
    const rrs = [1, 2].map(() =>
      applyPricingRuleToLine({
        title: "Window R&R",
        description: "Remove and replace existing window",
        unitCostCents: 99_999,
        permitWorkType: "ALTERATIONS_AND_REPAIRS",
      }),
    );

    expect(openings.every((line) => line.unitCostCents === 25_000 && line.unit === "EA" && line.priceSource === "RULE")).toBe(
      true,
    );
    expect(rrs.every((line) => line.unitCostCents === 30_000 && line.unit === "EA" && line.priceSource === "RULE")).toBe(
      true,
    );
    const total =
      openings.reduce((sum, line) => sum + line.unitCostCents, 0) +
      rrs.reduce((sum, line) => sum + line.unitCostCents, 0);
    expect(total).toBe(2 * 25_000 + 2 * 30_000);
  });

  it("prices drywall as SHEET at $40 when New Construction", () => {
    const result = applyPricingRuleToLine({
      title: "Drywall hang & finish",
      unitCostCents: 55_00,
      unit: "HR",
      permitWorkType: "NEW_CONSTRUCTION",
    });
    expect(result.unit).toBe("SHEET");
    expect(result.unitCostCents).toBe(DRYWALL_SHEET_CENTS);
    expect(result.priceSource).toBe("RULE");
  });

  it("prices drywall SHEET when gutted to studs even on Alterations", () => {
    const result = applyPricingRuleToLine({
      title: "Drywall",
      notes: "Garage gut to studs remodel",
      unitCostCents: 1,
      permitWorkType: "ALTERATIONS_AND_REPAIRS",
    });
    expect(result.unit).toBe("SHEET");
    expect(result.unitCostCents).toBe(DRYWALL_SHEET_CENTS);
  });

  it("does not apply drywall sheet rule on plain Alterations without gut", () => {
    const rule = matchPricingRule({
      title: "Drywall patch",
      permitWorkType: "ALTERATIONS_AND_REPAIRS",
    });
    expect(rule).toBeNull();
  });

  it("prices roofing at $85/SQ and warns when Roofr qty missing", () => {
    const result = applyPricingRuleToLine({
      title: "Roof tear-off and install",
      groupLabel: "Roofing",
      unitCostCents: 1,
      permitWorkType: "ALTERATIONS_AND_REPAIRS",
      hasRoofrQuantity: false,
    });
    expect(result.unit).toBe("SQ");
    expect(result.unitCostCents).toBe(ROOFING_TEAROFF_INSTALL_CENTS_PER_SQ);
    expect(result.priceSource).toBe("RULE");
    expect(result.warnings[0]).toMatch(/Roofr/i);
  });

  it("uses $150/EA windows only for New Construction", () => {
    const result = applyPricingRuleToLine({
      title: "Windows",
      unitCostCents: 1,
      permitWorkType: "NEW_CONSTRUCTION",
    });
    expect(result.unitCostCents).toBe(15_000);
  });
});
