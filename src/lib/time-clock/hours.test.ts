import { describe, expect, it } from "vitest";

import { baseLaborCostCents, ClockNotClosedError, OpenBreakError, workedHours } from "@/lib/time-clock/hours";

const at = (hour: number, minute = 0) => new Date(2026, 0, 5, hour, minute, 0);

describe("workedHours", () => {
  it("computes a plain 8-hour shift with no breaks", () => {
    expect(workedHours(at(7), at(15), [])).toBe(8);
  });

  it("subtracts a lunch break", () => {
    const hours = workedHours(at(7), at(15, 30), [{ startAt: at(11), endAt: at(11, 30) }]);
    expect(hours).toBe(8);
  });

  it("subtracts multiple breaks", () => {
    const hours = workedHours(at(7), at(16), [
      { startAt: at(10), endAt: at(10, 15) },
      { startAt: at(13), endAt: at(13, 30) },
    ]);
    expect(hours).toBeCloseTo(8.25, 5);
  });

  it("never goes negative even if breaks somehow exceed the shift", () => {
    const hours = workedHours(at(9), at(10), [{ startAt: at(9), endAt: at(12) }]);
    expect(hours).toBe(0);
  });

  it("throws if the entry hasn't been clocked out yet", () => {
    expect(() => workedHours(at(7), null, [])).toThrow(ClockNotClosedError);
  });

  it("throws if a break was never ended", () => {
    expect(() => workedHours(at(7), at(15), [{ startAt: at(11), endAt: null }])).toThrow(OpenBreakError);
  });
});

describe("baseLaborCostCents", () => {
  it("multiplies hours by the hourly rate", () => {
    expect(baseLaborCostCents(8, 4_500)).toBe(36_000); // 8 hrs @ $45
  });

  it("rounds a fractional-hour cost to the nearest cent", () => {
    expect(baseLaborCostCents(8.25, 4_500)).toBe(37_125);
  });

  it("returns zero for zero hours", () => {
    expect(baseLaborCostCents(0, 4_500)).toBe(0);
  });
});
