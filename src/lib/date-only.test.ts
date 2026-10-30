import { describe, expect, it } from "vitest";

import {
  formatDateOnly,
  isUtcMidnight,
  parseDateOnly,
  todayDateOnlyEastern,
} from "./date-only";

describe("date-only", () => {
  it("parses YYYY-MM-DD as UTC noon so Eastern does not shift the day", () => {
    const d = parseDateOnly("2026-10-27");
    expect(d.toISOString()).toBe("2026-10-27T12:00:00.000Z");
    // 12:00 UTC = 08:00 EDT — still Oct 27 in Jacksonville
    expect(
      new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/New_York",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(d),
    ).toBe("2026-10-27");
  });

  it("formats back to YYYY-MM-DD", () => {
    expect(formatDateOnly(parseDateOnly("2026-10-27"))).toBe("2026-10-27");
    expect(formatDateOnly(new Date("2026-10-27T00:00:00.000Z"))).toBe("2026-10-27");
    expect(formatDateOnly(null)).toBeNull();
  });

  it("detects UTC midnight import artifacts", () => {
    expect(isUtcMidnight(new Date("2026-10-27T00:00:00.000Z"))).toBe(true);
    expect(isUtcMidnight(new Date("2026-10-27T12:00:00.000Z"))).toBe(false);
  });

  it("todayDateOnlyEastern returns a UTC-noon Date for the Eastern calendar day", () => {
    const fixed = new Date("2026-10-30T03:30:00.000Z"); // Oct 29 11:30pm EDT
    const d = todayDateOnlyEastern(fixed);
    expect(formatDateOnly(d)).toBe("2026-10-29");
  });
});
