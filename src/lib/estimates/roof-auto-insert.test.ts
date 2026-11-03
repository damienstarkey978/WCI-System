import { describe, expect, it } from "vitest";

import {
  findMissingRoofAutoInsertTitles,
  findRoofRoofrSourceIssues,
  isRoofingLine,
  shouldApplyRoofPaymentSchedule,
} from "@/lib/estimates/roof-auto-insert";

describe("roof auto-insert", () => {
  it("detects roofing from title/cost code", () => {
    expect(isRoofingLine({ title: "Tear-off shingles" })).toBe(true);
    expect(isRoofingLine({ costCodeName: "Roofing Labor" })).toBe(true);
    expect(isRoofingLine({ title: "Interior paint" })).toBe(false);
  });

  it("lists missing permit/dumpster/wood lines", () => {
    expect(findMissingRoofAutoInsertTitles(["Roofing permit"])).toEqual([
      "Dumpster / debris haul-off",
      "Wood replacement allowance (as needed)",
    ]);
  });

  it("blocks SQ roof lines without a Roofr citation", () => {
    const issues = findRoofRoofrSourceIssues([
      {
        title: "Architectural shingles",
        unit: "SQ",
        quantityMilli: 25_000,
        sourceNote: null,
      },
      {
        title: "Architectural shingles (quoted)",
        unit: "SQ",
        quantityMilli: 25_000,
        sourceNote: "Roofr report #123",
      },
    ]);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatch(/Roofr/);
  });

  it("flags roof payment schedule when any roofing line exists", () => {
    expect(shouldApplyRoofPaymentSchedule([{ title: "Roofing permit" }])).toBe(true);
    expect(shouldApplyRoofPaymentSchedule([{ title: "Paint" }])).toBe(false);
  });
});
