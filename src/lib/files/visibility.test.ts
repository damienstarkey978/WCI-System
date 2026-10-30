import { describe, expect, it } from "vitest";

import {
  defaultFolderVisibility,
  isInternalCostDocumentFileName,
  isInternalFolderName,
} from "./visibility";

describe("isInternalFolderName", () => {
  it("matches Inspection: prefixes and Termite folders", () => {
    expect(isInternalFolderName("Inspection: Slab")).toBe(true);
    expect(isInternalFolderName("Inspection: ELECTRICAL — Final")).toBe(true);
    expect(isInternalFolderName("Termite Certificates")).toBe(true);
    expect(isInternalFolderName("  termite  ")).toBe(true);
  });

  it("leaves ordinary document folders public-policy eligible", () => {
    expect(isInternalFolderName("Plans")).toBe(false);
    expect(isInternalFolderName("Selections")).toBe(false);
  });
});

describe("defaultFolderVisibility", () => {
  it("defaults inspection/termite folders to internal", () => {
    expect(defaultFolderVisibility("Inspection: Framing")).toEqual({
      clientVisible: false,
      subVisible: false,
    });
  });

  it("defaults document folders to internal too (privacy-first)", () => {
    expect(defaultFolderVisibility("Plans")).toEqual({
      clientVisible: false,
      subVisible: false,
    });
  });
});

describe("isInternalCostDocumentFileName", () => {
  it("flags BT cost-doc imports", () => {
    expect(isInternalCostDocumentFileName("doc-bills__Turner_622680590_Roserush.pdf")).toBe(true);
    expect(
      isInternalCostDocumentFileName("doc-signed-purchase-orders-w__0023_Internally_Approved.pdf"),
    ).toBe(true);
    expect(isInternalCostDocumentFileName("doc-proofs-of-purchase__roserush_windows.pdf")).toBe(true);
    expect(isInternalCostDocumentFileName("PermitRockstar-East5th-paid.pdf")).toBe(true);
  });

  it("does not flag ordinary photos", () => {
    expect(isInternalCostDocumentFileName("IMG_5833.jpg")).toBe(false);
    expect(isInternalCostDocumentFileName("framing-wide.jpeg")).toBe(false);
  });
});
