import { describe, expect, it } from "vitest";

import { InvalidVendorSheetError, normalizeVendorName, parseDivisions, parseVendorSheet } from "@/lib/vendor-portal/import";

// Shaped like Buildertrend's real "SubsReport" export: a title row, a blank row, then the
// header — and divisions packed into one cell separated by ", \n".
const BUILDERTREND_EXPORT = [
  "SubsReport (exported on Sun; Oct 25; 2026),,,,,,,,",
  " ,,,,,,,,",
  'Company,Division,Activation,Primary contact,Trade agreement status,Liability exp.,Worker\'s comp exp.,Cell,Phone',
  ' PRIME WIRING SOLUTIONS LLC,,Active,Matt,,,,+19042385385,',
  '3SM Remodeling Services ,Special Construction,No Email,Miguel Angulo ,,,,,+1 (407) 205-4903',
  '"Affordable Renovations and services LLC","Masonry, \nFinishes, \nWood &  Plastics, \nFinishes",Active,Alex Lopez,,,,,',
  ",,,,,,,,",
].join("\n");

describe("parseVendorSheet", () => {
  it("skips the title rows, finds the header, and trims names", () => {
    const rows = parseVendorSheet(BUILDERTREND_EXPORT);

    expect(rows.map((row) => row.name)).toEqual(["PRIME WIRING SOLUTIONS LLC", "3SM Remodeling Services", "Affordable Renovations and services LLC"]);
  });

  it("maps contact, cell and phone columns and leaves absent ones null", () => {
    const [prime, threeSm] = parseVendorSheet(BUILDERTREND_EXPORT);

    expect(prime).toMatchObject({ primaryContact: "Matt", cellPhone: "+19042385385", phone: null, email: null, divisions: [] });
    expect(threeSm).toMatchObject({ primaryContact: "Miguel Angulo", cellPhone: null, phone: "+1 (407) 205-4903", divisions: ["Special Construction"] });
  });

  it("splits multi-line division cells, collapsing double spaces and duplicates", () => {
    const rows = parseVendorSheet(BUILDERTREND_EXPORT);

    expect(rows[2].divisions).toEqual(["Masonry", "Finishes", "Wood & Plastics"]);
  });

  it("does not carry over Buildertrend's activation column", () => {
    const rows = parseVendorSheet(BUILDERTREND_EXPORT);

    expect(rows.every((row) => !("activation" in row))).toBe(true);
  });

  it("reads an optional Email column, lowercasing it and dropping malformed values", () => {
    const rows = parseVendorSheet("Company,Email\nAcme,Sales@Acme.COM\nBadCo,not-an-email\nNoMail,");

    expect(rows.map((row) => row.email)).toEqual(["sales@acme.com", null, null]);
  });

  it("rejects a file with no Company column", () => {
    expect(() => parseVendorSheet("Foo,Bar\n1,2")).toThrow(InvalidVendorSheetError);
  });

  it("rejects a header with no vendors under it", () => {
    expect(() => parseVendorSheet("Company,Phone\n")).toThrow(InvalidVendorSheetError);
  });
});

describe("parseDivisions / normalizeVendorName", () => {
  it("handles empty and undefined cells", () => {
    expect(parseDivisions("")).toEqual([]);
    expect(parseDivisions(undefined)).toEqual([]);
  });

  it("treats spacing and case differences as the same company", () => {
    expect(normalizeVendorName("  Slab  Science LLC ")).toBe(normalizeVendorName("slab science llc"));
  });
});
