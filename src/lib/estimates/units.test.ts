import { describe, expect, it } from "vitest";

import {
  normalizeEstimateUnit,
  resolveLineUnit,
  UnknownEstimateUnitError,
} from "@/lib/estimates/units";

describe("normalizeEstimateUnit", () => {
  it("case-normalizes known units", () => {
    expect(normalizeEstimateUnit("sf")).toBe("SF");
    expect(normalizeEstimateUnit("Hr")).toBe("HR");
    expect(normalizeEstimateUnit("SHEET")).toBe("SHEET");
    expect(normalizeEstimateUnit("allowance")).toBe("ALLOWANCE");
  });

  it("accepts common aliases", () => {
    expect(normalizeEstimateUnit("sqft")).toBe("SF");
    expect(normalizeEstimateUnit("hour")).toBe("HR");
    expect(normalizeEstimateUnit("each")).toBe("EA");
  });

  it("rejects unknown units", () => {
    expect(() => normalizeEstimateUnit("gallon")).toThrow(UnknownEstimateUnitError);
  });

  it("returns null for blank", () => {
    expect(normalizeEstimateUnit(null)).toBeNull();
    expect(normalizeEstimateUnit("  ")).toBeNull();
  });
});

describe("resolveLineUnit", () => {
  it("falls back by cost type when unit omitted", () => {
    expect(resolveLineUnit(null, "LABOR")).toBe("HR");
    expect(resolveLineUnit(undefined, "MATERIAL")).toBe("EA");
    expect(resolveLineUnit("", "SUBCONTRACTOR")).toBe("LS");
  });
});
