import { describe, expect, it } from "vitest";

import {
  DEFAULT_ESTIMATE_MARKUP_BASIS_POINTS,
  LOCKED_ORG_ESTIMATE_RATE_DEFAULTS,
  resolveLineRate,
} from "@/lib/estimates/org-defaults";

describe("resolveLineRate", () => {
  it("locks every line to 40% MARKUP when override is off", () => {
    const resolved = resolveLineRate({
      org: LOCKED_ORG_ESTIMATE_RATE_DEFAULTS,
      rateMode: "MARGIN",
      rateBasisPoints: 1_500,
    });
    expect(resolved.rateMode).toBe("MARKUP");
    expect(resolved.rateBasisPoints).toBe(DEFAULT_ESTIMATE_MARKUP_BASIS_POINTS);
  });

  it("honors per-line rates when admin override is on", () => {
    const resolved = resolveLineRate({
      org: { ...LOCKED_ORG_ESTIMATE_RATE_DEFAULTS, allowPerLineRateOverride: true },
      rateMode: "MARGIN",
      rateBasisPoints: 1_500,
    });
    expect(resolved.rateMode).toBe("MARGIN");
    expect(resolved.rateBasisPoints).toBe(1_500);
  });
});
