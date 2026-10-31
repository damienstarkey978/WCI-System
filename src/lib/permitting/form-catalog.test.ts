import { describe, expect, it } from "vitest";

import {
  DUVAL_UNINCORPORATED_BUILDING_FORMS,
  JACKSONVILLE_BUILDING_FORMS,
  formTitleForKey,
  formsForCatalog,
} from "@/lib/permitting/form-catalog";

describe("form catalog", () => {
  it("lists 22 Jacksonville building forms with NOC preselected", () => {
    expect(JACKSONVILLE_BUILDING_FORMS).toHaveLength(22);
    expect(JACKSONVILLE_BUILDING_FORMS[0]?.key).toBe("noc");
    expect(JACKSONVILLE_BUILDING_FORMS[0]?.preselected).toBe(true);
  });

  it("matches live Unincorporated Building subset (7 forms)", () => {
    expect(DUVAL_UNINCORPORATED_BUILDING_FORMS).toHaveLength(7);
    const keys = formsForCatalog({
      county: "DUVAL",
      municipality: "DUVAL_UNINCORPORATED",
      permitType: "BUILDING",
    }).map((f) => f.key);
    expect(keys).toEqual([
      "noc",
      "affidavit_noc_filing",
      "septic_construction_permit",
      "ntbo",
      "reviewed_documents_sheet",
      "septic_site_plan_worksheet",
      "energy_form_r402",
    ]);
  });

  it("returns Jacksonville list for beach municipalities", () => {
    expect(
      formsForCatalog({
        county: "DUVAL",
        municipality: "JACKSONVILLE_BEACH",
        permitType: "BUILDING",
      }),
    ).toHaveLength(22);
  });

  it("resolves titles by key", () => {
    expect(formTitleForKey("pais")).toContain("Product Approval");
  });
});
