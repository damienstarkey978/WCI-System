/**
 * Building permit document pack (Duval / City of Jacksonville first).
 * Checklist + printable WCI worksheets for NOC / NTBO / building application
 * (see generate-docs.ts). Product-approval sheets and JEA/health letters stay
 * stubs until external templates / Permit Rockstar login land.
 */

export type PermitMunicipality = "DUVAL_JAX" | "OTHER";
export type WaterService = "CITY" | "SEPTIC" | "UNKNOWN";

export type PermitDocKind =
  | "NOC"
  | "NTBO"
  | "PRODUCT_APPROVAL"
  | "BUILDING_PERMIT_APPLICATION"
  | "JEA_LETTER"
  | "HEALTH_DEPARTMENT_LETTER";

export interface PermitDocDefinition {
  readonly kind: PermitDocKind;
  readonly title: string;
  readonly description: string;
  /** When false, doc is optional / conditional for this pack. */
  readonly requiredByDefault: boolean;
  readonly status: "ready" | "stub";
}

export interface PermitDocPackInput {
  readonly municipality: PermitMunicipality;
  readonly waterService: WaterService;
  /** Bathroom addition in scope → JEA letter/bill on file for city water. */
  readonly bathroomAdd: boolean;
  readonly nocOnFile: boolean;
  readonly ntboFiled: boolean;
}

export const DUVAL_DOC_CATALOG: readonly PermitDocDefinition[] = [
  {
    kind: "NOC",
    title: "Notice of Commencement (NOC)",
    description: "Recorded NOC for the job address — required before first inspection in Duval.",
    requiredByDefault: true,
    status: "ready",
  },
  {
    kind: "NTBO",
    title: "Notice to Building Official (NTBO)",
    description: "Filed notice that construction is starting under the building permit.",
    requiredByDefault: true,
    status: "ready",
  },
  {
    kind: "PRODUCT_APPROVAL",
    title: "Product approval sheets",
    description: "Florida product approvals for windows, doors, roofing, and other rated products.",
    requiredByDefault: true,
    status: "stub",
  },
  {
    kind: "BUILDING_PERMIT_APPLICATION",
    title: "Building permit application",
    description: "City of Jacksonville / EPICS building permit application pack.",
    requiredByDefault: true,
    status: "ready",
  },
  {
    kind: "JEA_LETTER",
    title: "JEA letter / bill on file",
    description: "Required when a bathroom is added on city water — JEA account letter or bill.",
    requiredByDefault: false,
    status: "stub",
  },
  {
    kind: "HEALTH_DEPARTMENT_LETTER",
    title: "Health department letter",
    description: "Septic path — county health department approval letter instead of JEA.",
    requiredByDefault: false,
    status: "stub",
  },
];

export function docsForPack(input: PermitDocPackInput): readonly (PermitDocDefinition & {
  readonly included: boolean;
  readonly reason: string;
})[] {
  const jeaNeeded = input.bathroomAdd && input.waterService === "CITY";
  const healthNeeded = input.waterService === "SEPTIC";

  return DUVAL_DOC_CATALOG.map((doc) => {
    if (doc.kind === "JEA_LETTER") {
      return {
        ...doc,
        included: jeaNeeded,
        reason: jeaNeeded
          ? "Bathroom add on city water — JEA letter/bill required."
          : "Only when bathroom add + city water.",
      };
    }
    if (doc.kind === "HEALTH_DEPARTMENT_LETTER") {
      return {
        ...doc,
        included: healthNeeded,
        reason: healthNeeded ? "Septic job — health department letter path." : "Only when water service is septic.",
      };
    }
    if (doc.kind === "NOC") {
      return {
        ...doc,
        included: true,
        reason: input.nocOnFile ? "NOC marked on file on the job." : "Include NOC in the download pack.",
      };
    }
    if (doc.kind === "NTBO") {
      return {
        ...doc,
        included: true,
        reason: input.ntboFiled ? "NTBO marked filed on the job." : "Include NTBO in the download pack.",
      };
    }
    return {
      ...doc,
      included: doc.requiredByDefault,
      reason: "Standard Duval / City of Jacksonville building permit pack.",
    };
  });
}
