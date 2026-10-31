/**
 * Jacksonville / Duval permit form catalog for Permit Rockstar–style packages.
 * Keys are stable identifiers stored on PermitPackageForm.formKey.
 *
 * Live Permit Rockstar (2026-10-31): form sets are keyed by
 * county + municipality + permitType. Duval Unincorporated + Building shows 7
 * forms; Jacksonville Building expands toward the 22-form list in the rebuild
 * spec. See docs/permit-rockstar-parity-notes.md.
 */

export type PermitCatalogCounty = "DUVAL";

export type PermitCatalogMunicipality =
  | "JACKSONVILLE"
  | "DUVAL_UNINCORPORATED"
  | "JACKSONVILLE_BEACH"
  | "ATLANTIC_BEACH"
  | "NEPTUNE_BEACH";

export type PermitCatalogPermitType =
  | "BUILDING"
  | "ELECTRICAL"
  | "FIRE"
  | "MECHANICAL"
  | "PLUMBING"
  | "ROOFING"
  | "OTHER";

export interface PermitFormCatalogEntry {
  readonly key: string;
  readonly title: string;
  /** Preselected when the form picker opens (NOC in live PR). */
  readonly preselected?: boolean;
}

/** Spec Jacksonville building list (22). Official PDFs land in /public/permit-forms/duval-jax/. */
export const JACKSONVILLE_BUILDING_FORMS: readonly PermitFormCatalogEntry[] = [
  { key: "noc", title: "Notice of Commencement", preselected: true },
  {
    key: "affidavit_attaching_new_structure",
    title: "Affidavit For Attaching A New Structure To An Existing Structure",
  },
  { key: "asbestos_requirements", title: "Asbestos Requirements" },
  {
    key: "affidavit_aluminum_structure",
    title: "Attaching an Aluminum Structure to an Existing Structure Affidavit",
  },
  { key: "change_of_contractor", title: "Change of Contractor Form Letter" },
  {
    key: "contractor_asbestos_notification",
    title: "Contractor Asbestos Notification Statement",
  },
  { key: "demolition_grassing_letter", title: "Demolition Grassing Letter" },
  { key: "emergency_reconnect_letter", title: "Emergency Reconnect Letter (ERL)" },
  { key: "existing_slab_affidavit", title: "Existing Slab Affidavit" },
  { key: "hvac_inspection_exemption", title: "HVAC Inspection Exemption" },
  {
    key: "homeowner_sunroom_enclosure",
    title: "Homeowner Sunroom Enclosure Affidavit",
  },
  {
    key: "jaxepics_contractor_registration",
    title: "JaxEPICS Contractor Registration Form",
  },
  { key: "mobile_home_egress", title: "Mobile Home Egress Requirements" },
  {
    key: "permission_by_owner",
    title: "Permission By Owner to Obtain Permits (Property Owner Authorization Form)",
  },
  {
    key: "private_pool_safety",
    title: "Private Swimming Pool Safety Affirmation",
  },
  { key: "pais", title: "Product Approval Information Sheet (PAIS)" },
  {
    key: "affidavit_noc_filing",
    title: "Affidavit of Notice of Commencement Filing",
  },
  {
    key: "septic_construction_permit",
    title: "Application for Septic System Construction Permit",
  },
  {
    key: "ntbo",
    title: "Notice to Building Official of Use of Private Provider (NTBO)",
  },
  { key: "reviewed_documents_sheet", title: "Reviewed Documents Sheet" },
  {
    key: "septic_site_plan_worksheet",
    title: "Septic System Site Plan Worksheet",
  },
  { key: "energy_form_r402", title: "Energy Form R402" },
] as const;

/**
 * Live PR (2026-10-31): Building + Duval Unincorporated shows these seven.
 * Kept as an explicit subset so the picker does not invent Jacksonville-only
 * forms for unincorporated parcels.
 */
export const DUVAL_UNINCORPORATED_BUILDING_FORMS: readonly PermitFormCatalogEntry[] = [
  { key: "noc", title: "Notice of Commencement", preselected: true },
  {
    key: "affidavit_noc_filing",
    title: "Affidavit of Notice of Commencement Filing",
  },
  {
    key: "septic_construction_permit",
    title: "Application for Septic System Construction Permit",
  },
  {
    key: "ntbo",
    title: "Notice to Building Official of Use of Private Provider",
  },
  { key: "reviewed_documents_sheet", title: "Reviewed Documents Sheet" },
  {
    key: "septic_site_plan_worksheet",
    title: "Septic System Site Plan Worksheet",
  },
  { key: "energy_form_r402", title: "Energy Form R402" },
] as const;

export const DUVAL_MUNICIPALITIES: readonly {
  readonly key: PermitCatalogMunicipality;
  readonly label: string;
}[] = [
  { key: "JACKSONVILLE", label: "Jacksonville" },
  { key: "DUVAL_UNINCORPORATED", label: "Duval County Unincorporated" },
  { key: "JACKSONVILLE_BEACH", label: "Jacksonville Beach" },
  { key: "ATLANTIC_BEACH", label: "Atlantic Beach" },
  { key: "NEPTUNE_BEACH", label: "Neptune Beach" },
] as const;

export function formsForCatalog(input: {
  readonly county: PermitCatalogCounty;
  readonly municipality: PermitCatalogMunicipality;
  readonly permitType: PermitCatalogPermitType;
}): readonly PermitFormCatalogEntry[] {
  if (input.county !== "DUVAL" || input.permitType !== "BUILDING") {
    // Non-building / other counties: NOC-only starter until catalogs land.
    return [{ key: "noc", title: "Notice of Commencement", preselected: true }];
  }
  if (input.municipality === "DUVAL_UNINCORPORATED") {
    return DUVAL_UNINCORPORATED_BUILDING_FORMS;
  }
  // Jacksonville + beach cities: full Jacksonville building list from the spec.
  return JACKSONVILLE_BUILDING_FORMS;
}

export function formTitleForKey(formKey: string): string {
  const hit =
    JACKSONVILLE_BUILDING_FORMS.find((f) => f.key === formKey) ??
    DUVAL_UNINCORPORATED_BUILDING_FORMS.find((f) => f.key === formKey);
  return hit?.title ?? formKey;
}
