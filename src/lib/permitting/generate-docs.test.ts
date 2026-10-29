import { describe, expect, it } from "vitest";

import { docsForPack } from "@/lib/permitting/docs";
import { generatePermitDoc, generatePrintablePack, PRINTABLE_PERMIT_DOC_KINDS } from "@/lib/permitting/generate-docs";

const CTX = {
  jobName: "3640 Newcomb Bldg 1",
  addressLine1: "3640 Newcomb Rd",
  city: "Jacksonville",
  state: "FL",
  postalCode: "32210",
  permitNumber: "BLD-2026-001",
  sqft: 1800,
  lotInfo: "Lot 12",
  nocOnFile: false,
  ntboFiled: false,
  orgName: "World Construction Inc.",
  orgAddressLine1: "6005 Powers Ave. #210",
  orgCity: "Jacksonville",
  orgState: "FL",
  orgPostalCode: "32217",
  orgPhone: "904-717-1729",
  orgEmail: "office@worldconstructioninc.com",
  waterService: "CITY" as const,
  bathroomAdd: true,
  permitTrades: ["Building", "Electrical"],
};

describe("generatePermitDoc", () => {
  it("builds NOC / NTBO / building application worksheets from job context", () => {
    const noc = generatePermitDoc("NOC", CTX);
    expect(noc?.title).toMatch(/Notice of Commencement/);
    expect(noc?.fields.some((f) => f.label === "Property address" && f.value.includes("3640 Newcomb"))).toBe(true);

    const ntbo = generatePermitDoc("NTBO", CTX);
    expect(ntbo?.fields.some((f) => f.label === "Building permit #" && f.value === "BLD-2026-001")).toBe(true);

    const app = generatePermitDoc("BUILDING_PERMIT_APPLICATION", CTX);
    expect(app?.fields.some((f) => f.label === "Bathroom addition in scope" && f.value === "Yes")).toBe(true);
  });

  it("returns null for external stub kinds", () => {
    expect(generatePermitDoc("PRODUCT_APPROVAL", CTX)).toBeNull();
    expect(generatePermitDoc("JEA_LETTER", CTX)).toBeNull();
  });

  it("print pack only includes printable kinds that are in the selected pack", () => {
    const pack = docsForPack({
      municipality: "DUVAL_JAX",
      waterService: "CITY",
      bathroomAdd: true,
      nocOnFile: false,
      ntboFiled: false,
    });
    const kinds = pack.filter((d) => d.included && PRINTABLE_PERMIT_DOC_KINDS.includes(d.kind)).map((d) => d.kind);
    const pages = generatePrintablePack(kinds, CTX);
    expect(pages.map((p) => p.kind)).toEqual(["NOC", "NTBO", "BUILDING_PERMIT_APPLICATION"]);
  });
});
