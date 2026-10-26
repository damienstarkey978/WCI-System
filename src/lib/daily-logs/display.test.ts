import { describe, expect, it } from "vitest";

import { logHeading, weatherSummary } from "./display";

describe("daily log display", () => {
  it("joins the date and the title with a bar, and falls back to the date alone", () => {
    const d = new Date("2026-10-23T15:00:00Z");
    expect(logHeading(d, "Prime walk thru")).toMatch(/Oct 23 \| Prime walk thru$/);
    expect(logHeading(d, null)).toMatch(/Oct 23$/);
  });

  it("summarises weather and ignores junk", () => {
    expect(weatherSummary({ temperatureF: 74.6, condition: "Sunny" })).toEqual({ condition: "Sunny", tempF: 75 });
    expect(weatherSummary({})).toBeNull();
    expect(weatherSummary(null)).toBeNull();
  });
});
