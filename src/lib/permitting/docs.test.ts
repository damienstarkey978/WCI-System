import { describe, expect, it } from "vitest";

import { docsForPack } from "@/lib/permitting/docs";

describe("permit docs pack", () => {
  it("includes JEA when bathroom add + city water", () => {
    const pack = docsForPack({
      municipality: "DUVAL_JAX",
      waterService: "CITY",
      bathroomAdd: true,
      nocOnFile: false,
      ntboFiled: false,
    });
    expect(pack.find((d) => d.kind === "JEA_LETTER")?.included).toBe(true);
    expect(pack.find((d) => d.kind === "HEALTH_DEPARTMENT_LETTER")?.included).toBe(false);
  });

  it("includes health department letter on septic", () => {
    const pack = docsForPack({
      municipality: "DUVAL_JAX",
      waterService: "SEPTIC",
      bathroomAdd: false,
      nocOnFile: true,
      ntboFiled: true,
    });
    expect(pack.find((d) => d.kind === "HEALTH_DEPARTMENT_LETTER")?.included).toBe(true);
    expect(pack.find((d) => d.kind === "JEA_LETTER")?.included).toBe(false);
  });
});
