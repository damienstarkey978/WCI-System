import { describe, expect, it } from "vitest";

import { startOfWeekEastern } from "./format";

describe("startOfWeekEastern", () => {
  it("returns Sunday 00:00 Eastern (EDT = UTC-4) for a mid-week October date", () => {
    // Thursday Oct 30, 2026 15:00 UTC = 11:00 AM Eastern
    const thursday = new Date("2026-10-30T15:00:00.000Z");
    const weekStart = startOfWeekEastern(thursday);
    // Sunday Oct 25, 2026 00:00 EDT = 04:00 UTC
    expect(weekStart.toISOString()).toBe("2026-10-25T04:00:00.000Z");
  });

  it("keeps a late Saturday evening Eastern shift in the same week as Sunday", () => {
    // Saturday Oct 31, 2026 23:30 Eastern = Sunday Nov 1 03:30 UTC
    const lateSaturdayEt = new Date("2026-11-01T03:30:00.000Z");
    const weekStart = startOfWeekEastern(lateSaturdayEt);
    expect(weekStart.toISOString()).toBe("2026-10-25T04:00:00.000Z");
  });
});
