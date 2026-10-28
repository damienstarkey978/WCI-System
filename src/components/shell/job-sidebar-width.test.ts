import { describe, expect, it } from "vitest";

import {
  JOB_SIDEBAR_DEFAULT_WIDTH_PX,
  JOB_SIDEBAR_MAX_WIDTH_PX,
  JOB_SIDEBAR_MIN_WIDTH_PX,
  clampJobSidebarWidth,
} from "./JobSidebar";

describe("clampJobSidebarWidth", () => {
  it("keeps the Buildertrend default inside bounds", () => {
    expect(clampJobSidebarWidth(JOB_SIDEBAR_DEFAULT_WIDTH_PX)).toBe(203);
  });

  it("clamps below min and above max", () => {
    expect(clampJobSidebarWidth(100)).toBe(JOB_SIDEBAR_MIN_WIDTH_PX);
    expect(clampJobSidebarWidth(999)).toBe(JOB_SIDEBAR_MAX_WIDTH_PX);
  });

  it("rounds fractional widths", () => {
    expect(clampJobSidebarWidth(203.6)).toBe(204);
  });

  it("falls back to default for non-finite input", () => {
    expect(clampJobSidebarWidth(Number.NaN)).toBe(JOB_SIDEBAR_DEFAULT_WIDTH_PX);
    expect(clampJobSidebarWidth(Number.POSITIVE_INFINITY)).toBe(JOB_SIDEBAR_DEFAULT_WIDTH_PX);
  });
});
