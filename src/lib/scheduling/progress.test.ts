import { describe, expect, it } from "vitest";

import { clampBasisPoints, weightedPercentComplete } from "./progress";

describe("weightedPercentComplete", () => {
  it("weights by duration", () => {
    // 20 days at 50% and 5 days at 100% => (20*5000 + 5*10000) / 25 = 6000
    expect(
      weightedPercentComplete([
        { durationDays: 20, percentCompleteBasisPoints: 5000 },
        { durationDays: 5, percentCompleteBasisPoints: 10000 },
      ]),
    ).toBe(6000);
  });

  it("returns null with nothing to weigh", () => {
    expect(weightedPercentComplete([])).toBeNull();
    expect(weightedPercentComplete([{ durationDays: 0, percentCompleteBasisPoints: 10000 }])).toBeNull();
  });

  it("clamps out of range values instead of overshooting", () => {
    expect(weightedPercentComplete([{ durationDays: 3, percentCompleteBasisPoints: 25000 }])).toBe(10000);
    expect(clampBasisPoints(-5)).toBe(0);
    expect(clampBasisPoints(Number.NaN)).toBe(0);
  });
});
