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

  it("matches live Unincorporated Building subset plus WCI Scope of Values", () => {
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
      "scope_of_values",
    ]);
  });

  it("returns Jacksonville city list + WCI Scope of Values for beach municipalities", () => {
    expect(
      formsForCatalog({
        county: "DUVAL",
        municipality: "JACKSONVILLE_BEACH",
        permitType: "BUILDING",
      }),
    ).toHaveLength(23);
  });

  it("resolves titles by key including Scope of Values", () => {
    expect(formTitleForKey("pais")).toContain("Product Approval");
    expect(formTitleForKey("scope_of_values")).toBe("Scope of Values");
  });
});
