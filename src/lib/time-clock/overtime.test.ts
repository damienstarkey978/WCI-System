import { describe, expect, it } from "vitest";

import { computeWeeklyOvertime, overtimePremiumCents } from "@/lib/time-clock/overtime";

describe("computeWeeklyOvertime", () => {
  it("reports no overtime for a standard 40-hour week", () => {
    const result = computeWeeklyOvertime([
      { date: "2026-01-05", hours: 8 },
      { date: "2026-01-06", hours: 8 },
      { date: "2026-01-07", hours: 8 },
      { date: "2026-01-08", hours: 8 },
      { date: "2026-01-09", hours: 8 },
    ]);
    expect(result.totalHours).toBe(40);
    expect(result.overtimeHours).toBe(0);
    expect(result.regularHours).toBe(40);
    expect(result.rule).toBe("NONE");
  });

  it("uses the daily rule when a single long day produces more OT than the weekly rule would", () => {
    // 9+9+9+9+4 = 40 total (no weekly OT), but 4 hours of daily OT (1 each on the first four days).
    const result = computeWeeklyOvertime([
      { date: "2026-01-05", hours: 9 },
      { date: "2026-01-06", hours: 9 },
      { date: "2026-01-07", hours: 9 },
      { date: "2026-01-08", hours: 9 },
      { date: "2026-01-09", hours: 4 },
    ]);
    expect(result.totalHours).toBe(40);
    expect(result.dailyOvertimeHours).toBe(4);
    expect(result.weeklyOvertimeHours).toBe(0);
    expect(result.overtimeHours).toBe(4);
    expect(result.rule).toBe("DAILY");
    expect(result.regularHours).toBe(36);
  });

  it("uses the weekly rule when it produces more OT than the daily rule would", () => {
    // 8 hours every day for 6 days = 48 total. No day exceeds 8 (0 daily OT), but
    // the week exceeds 40 by 8 hours.
    const result = computeWeeklyOvertime([
      { date: "2026-01-05", hours: 8 },
      { date: "2026-01-06", hours: 8 },
      { date: "2026-01-07", hours: 8 },
      { date: "2026-01-08", hours: 8 },
      { date: "2026-01-09", hours: 8 },
      { date: "2026-01-10", hours: 8 },
    ]);
    expect(result.totalHours).toBe(48);
    expect(result.dailyOvertimeHours).toBe(0);
    expect(result.weeklyOvertimeHours).toBe(8);
    expect(result.overtimeHours).toBe(8);
    expect(result.rule).toBe("WEEKLY");
    expect(result.regularHours).toBe(40);
  });

  it("takes the greater of the two rules when both would flag overtime", () => {
    // 10 hours/day for 5 days = 50 total. Daily OT: 2/day x 5 = 10. Weekly OT: 50-40=10.
    // They tie here — DAILY wins ties per the >= comparison, which is fine since the
    // hours are identical either way.
    const result = computeWeeklyOvertime([
      { date: "2026-01-05", hours: 10 },
      { date: "2026-01-06", hours: 10 },
      { date: "2026-01-07", hours: 10 },
      { date: "2026-01-08", hours: 10 },
      { date: "2026-01-09", hours: 10 },
    ]);
    expect(result.overtimeHours).toBe(10);
    expect(result.regularHours).toBe(40);
  });

  it("handles an empty week", () => {
    const result = computeWeeklyOvertime([]);
    expect(result.totalHours).toBe(0);
    expect(result.overtimeHours).toBe(0);
    expect(result.rule).toBe("NONE");
  });

  it("never reports negative regular hours", () => {
    const result = computeWeeklyOvertime([{ date: "2026-01-05", hours: 12 }]);
    expect(result.regularHours).toBeGreaterThanOrEqual(0);
  });
});

describe("overtimePremiumCents", () => {
  it("computes the extra half-time premium owed on top of straight pay", () => {
    // 5 OT hours at a $40/hr base rate: premium is 0.5 x 5 x $40 = $100.
    expect(overtimePremiumCents(5, 4_000)).toBe(10_000);
  });

  it("returns zero for zero overtime hours", () => {
    expect(overtimePremiumCents(0, 4_000)).toBe(0);
  });
});
