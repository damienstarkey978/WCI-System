import { describe, expect, it } from "vitest";

import { findConfidenceGateIssues, findUnreviewedConfidenceLines } from "./confidence-gate";

describe("confidence gate", () => {
  it("flags unreviewed LOW and MEDIUM lines", () => {
    const lines = [
      { id: "1", title: "Paint", confidence: "HIGH" as const },
      { id: "2", title: "Unknown fixture", confidence: "LOW" as const },
      { id: "3", title: "Maybe tile", confidence: "MEDIUM" as const, confidenceReviewedAt: new Date() },
      { id: "4", title: "Maybe labor", confidence: "MEDIUM" as const },
    ];
    const unreviewed = findUnreviewedConfidenceLines(lines);
    expect(unreviewed.map((line) => line.id)).toEqual(["2", "4"]);
    expect(findConfidenceGateIssues(lines)).toHaveLength(2);
  });

  it("ignores hand-entered lines with null confidence", () => {
    expect(findUnreviewedConfidenceLines([{ id: "h", title: "Hand", confidence: null }])).toEqual([]);
  });
});
