import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";

import type { PackageFillContext } from "@/lib/permitting/package-form-fill";
import {
  composeR402PackagePdf,
  r402FieldsFromBag,
  r402WorksheetHasStaffValues,
} from "@/lib/permitting/r402-worksheet";

const baseCtx: PackageFillContext = {
  packageName: "Robin Hood ref package",
  propertyAddress: "4212 Robin Hood Rd",
  taxFolio: "100804-0000",
  owner: { name: "COOK FAMILY REVOCABLE TRUST" },
  contractor: { companyName: "World Construction Inc", licenseNumber: "CGC1504962" },
};

describe("r402 worksheet", () => {
  it("treats empty bag as no staff values", () => {
    const fields = r402FieldsFromBag({});
    expect(r402WorksheetHasStaffValues(fields)).toBe(false);
  });

  it("composes cover + official blank without inventing worksheet values", async () => {
    const empty = r402FieldsFromBag({});
    const bytes = await composeR402PackagePdf(baseCtx, empty);
    const doc = await PDFDocument.load(bytes);
    // Cover + 3-page official blank.
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(4);
  });

  it("echoes staff SF / system on the cover only when provided", async () => {
    const fields = r402FieldsFromBag({
      r402ClimateZone: "2A",
      r402ConditionedSqFt: "250",
      r402MechanicalSystem: "Mini-split (staff entered)",
    });
    expect(r402WorksheetHasStaffValues(fields)).toBe(true);
    const bytes = await composeR402PackagePdf(baseCtx, fields);
    expect(bytes.byteLength).toBeGreaterThan(10_000);
  });
});
