import { describe, expect, it } from "vitest";

import {
  InvalidClientSheetError,
  normalizeClientName,
  normalizeSpreadsheetScalar,
  parseClientSheet,
  preferDisplayName,
} from "@/lib/client-portal/import";

const BUILDERTREND_EXPORT = [
  '"Client ContactsReport (exported on Tue, Oct 27, 2026)",,,,,,,,,,,,',
  " ,,,,,,,,,,,,",
  "Name,Activation Status,Phone,Cell,Address,City,State,Zip,Jobs,Lead Opportunities,Email,First Name,Last Name",
  "2935 Lakeshore Blvd,Inactive,,19045740585.0,2935 Lakeshore Blvd,Jacksonville,Fl,32210.0,0,1.0,brockml223@gmail.com,Michael,Brock",
  "395 Summerset Drive,Active,,14403462331.0,395 Summerset Drive,St Johns,FL,32259.0,1.0,1.0,jdayton1121client@gmail.com,Jeff,Dayton",
  "Albert  Villegas,Active,904-626-1318,,123 Main,Jacksonville,fl,32258.0,0,0,albert.villegas@firstonsite.com,Albert,Villegas",
  "No Mail Contact,Inactive,,,,,,,0,0,,,Jane,Doe",
  "Andrew  Chess,Active,,,,Jacksonville,FL,,0,0,\"chizh23@gmail.com, juliannclub@gmail.com\",Andrew,Chess",
].join("\n");

describe("parseClientSheet", () => {
  it("skips the title rows and maps Buildertrend Client Contacts columns", () => {
    const rows = parseClientSheet(BUILDERTREND_EXPORT);

    expect(rows).toHaveLength(5);
    expect(rows[0]).toMatchObject({
      name: "Michael Brock",
      email: "brockml223@gmail.com",
      cellPhone: "19045740585",
      addressLine1: "2935 Lakeshore Blvd",
      city: "Jacksonville",
      state: "FL",
      postalCode: "32210",
    });
    expect(rows[2]).toMatchObject({
      name: "Albert Villegas",
      phone: "904-626-1318",
      email: "albert.villegas@firstonsite.com",
    });
  });

  it("keeps people-named rows as the Name column even when First/Last differ slightly", () => {
    const rows = parseClientSheet(BUILDERTREND_EXPORT);
    expect(rows[2].name).toBe("Albert Villegas");
  });

  it("does not carry over Buildertrend's Activation Status", () => {
    const rows = parseClientSheet(BUILDERTREND_EXPORT);
    expect(rows.every((row) => !("activation" in row))).toBe(true);
  });

  it("uses the first email when a cell lists several", () => {
    const rows = parseClientSheet(BUILDERTREND_EXPORT);
    const andrew = rows.find((row) => row.name === "Andrew Chess");
    expect(andrew).toMatchObject({ email: "chizh23@gmail.com", extraEmails: ["juliannclub@gmail.com"] });
  });

  it("allows rows with no email (create path skips them later)", () => {
    const rows = parseClientSheet(BUILDERTREND_EXPORT);
    expect(rows.some((row) => row.name === "No Mail Contact" && row.email === null)).toBe(true);
  });

  it("rejects a file with no Name column", () => {
    expect(() => parseClientSheet("Foo,Bar\n1,2")).toThrow(InvalidClientSheetError);
  });

  it("rejects a header with no contacts under it", () => {
    expect(() => parseClientSheet("Name,Email\n")).toThrow(InvalidClientSheetError);
  });
});

describe("normalizeSpreadsheetScalar / preferDisplayName / normalizeClientName", () => {
  it("strips Excel float tails from phones and zips", () => {
    expect(normalizeSpreadsheetScalar("19045740585.0")).toBe("19045740585");
    expect(normalizeSpreadsheetScalar("32210.0")).toBe("32210");
    expect(normalizeSpreadsheetScalar("904-626-1318")).toBe("904-626-1318");
    expect(normalizeSpreadsheetScalar(null)).toBeNull();
  });

  it("prefers First Last only for address-style Name values", () => {
    expect(preferDisplayName("2935 Lakeshore Blvd", "Michael", "Brock")).toBe("Michael Brock");
    expect(preferDisplayName("Albert  Villegas", "Albert", "Villegas")).toBe("Albert Villegas");
    expect(preferDisplayName(null, "Jane", "Doe")).toBe("Jane Doe");
  });

  it("treats spacing and case differences as the same contact", () => {
    expect(normalizeClientName("  Albert  Villegas ")).toBe(normalizeClientName("albert villegas"));
  });
});
