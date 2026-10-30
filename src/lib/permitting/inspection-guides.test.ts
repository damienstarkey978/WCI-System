import { describe, expect, it } from "vitest";

import {
  guideForInspectionName,
  INSPECTION_GUIDES,
  inspectionPictureFolderName,
  inspectionPictureFolderNameForTrade,
  isSlabInspection,
} from "@/lib/permitting/inspection-guides";

describe("inspection guides catalog", () => {
  it("excludes pools", () => {
    expect(INSPECTION_GUIDES.some((g) => /pool/i.test(g.title))).toBe(false);
  });

  it("maps framing to a Permit Rockstar URL", () => {
    const guide = guideForInspectionName("Framing");
    expect(guide?.guideUrl).toContain("/building/framing/");
  });

  it("names folders distinctly from Documents folders", () => {
    expect(inspectionPictureFolderName("Slab")).toBe("Inspection: Slab");
    expect(inspectionPictureFolderNameForTrade("Final", "ELECTRICAL")).toBe(
      "Inspection: ELECTRICAL — Final",
    );
    expect(isSlabInspection("Slab")).toBe(true);
  });
});
