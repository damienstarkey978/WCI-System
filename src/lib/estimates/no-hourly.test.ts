import { describe, expect, it } from "vitest";

import { assertNoHourlyLaborForPerUnitTrade, HourlyLaborNotAllowedError } from "@/lib/estimates/no-hourly";

describe("assertNoHourlyLaborForPerUnitTrade", () => {
  it("rejects LABOR + HR for roofing", () => {
    expect(() =>
      assertNoHourlyLaborForPerUnitTrade({
        costType: "LABOR",
        unit: "HR",
        title: "Roof tear-off labor",
        groupLabel: "Roofing",
      }),
    ).toThrow(HourlyLaborNotAllowedError);
  });

  it("rejects LABOR with default HR for windows", () => {
    expect(() =>
      assertNoHourlyLaborForPerUnitTrade({
        costType: "LABOR",
        unit: null,
        title: "Window install",
        costCodeName: "Windows Labor",
      }),
    ).toThrow(/windows\/doors/i);
  });

  it("allows LABOR + SF for paint", () => {
    expect(() =>
      assertNoHourlyLaborForPerUnitTrade({
        costType: "LABOR",
        unit: "SF",
        title: "Interior paint labor",
      }),
    ).not.toThrow();
  });

  it("allows LABOR + HR for generic framing with no per-unit rule", () => {
    expect(() =>
      assertNoHourlyLaborForPerUnitTrade({
        costType: "LABOR",
        unit: "HR",
        title: "Framing labor",
        groupLabel: "Framing",
      }),
    ).not.toThrow();
  });

  it("ignores MATERIAL + HR", () => {
    expect(() =>
      assertNoHourlyLaborForPerUnitTrade({
        costType: "MATERIAL",
        unit: "HR",
        title: "Roofing underlayment",
      }),
    ).not.toThrow();
  });
});
