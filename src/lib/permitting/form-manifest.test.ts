import { describe, expect, it } from "vitest";

import {
  blankPdfUrlsByFormKey,
  clearDuvalJaxManifestCache,
  officialBlankPublicUrl,
} from "@/lib/permitting/form-manifest";

describe("form manifest blank URLs", () => {
  it("exposes public URLs for sourced Jacksonville blanks", () => {
    clearDuvalJaxManifestCache();
    expect(officialBlankPublicUrl("noc")).toBe("/permit-forms/duval-jax/noc.pdf");
    expect(officialBlankPublicUrl("permission_by_owner")).toBe(
      "/permit-forms/duval-jax/permission_by_owner.pdf",
    );
    expect(officialBlankPublicUrl("pais")).toBe("/permit-forms/duval-jax/pais.pdf");
    expect(officialBlankPublicUrl("scope_of_values")).toBeNull();

    const map = blankPdfUrlsByFormKey();
    expect(map.noc).toBe("/permit-forms/duval-jax/noc.pdf");
    expect(map.pais).toBe("/permit-forms/duval-jax/pais.pdf");
    expect(map.scope_of_values).toBeUndefined();
  });
});
