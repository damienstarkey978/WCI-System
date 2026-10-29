/**
 * Printable Duval / City of Jacksonville building-permit pack content.
 *
 * These are WCI-filled worksheets staff can Print / Save as PDF — not pixel-perfect
 * Permit Rockstar clones (that needs the PR login). Product-approval sheets and
 * JEA/health letters stay external stubs until those templates are sourced.
 */

import type { PermitDocKind } from "@/lib/permitting/docs";

export interface PermitDocJobContext {
  readonly jobName: string;
  readonly addressLine1: string | null;
  readonly city: string | null;
  readonly state: string | null;
  readonly postalCode: string | null;
  readonly permitNumber: string | null;
  readonly sqft: number | null;
  readonly lotInfo: string | null;
  readonly nocOnFile: boolean;
  readonly ntboFiled: boolean;
  readonly orgName: string;
  readonly orgAddressLine1: string | null;
  readonly orgCity: string | null;
  readonly orgState: string | null;
  readonly orgPostalCode: string | null;
  readonly orgPhone: string | null;
  readonly orgEmail: string | null;
  readonly waterService: "CITY" | "SEPTIC" | "UNKNOWN";
  readonly bathroomAdd: boolean;
  readonly permitTrades: readonly string[];
}

export interface PermitDocField {
  readonly label: string;
  readonly value: string;
}

export interface GeneratedPermitDoc {
  readonly kind: PermitDocKind;
  readonly title: string;
  readonly subtitle: string;
  readonly legalNote: string;
  readonly fields: readonly PermitDocField[];
  readonly checklist: readonly string[];
}

function jobAddress(ctx: PermitDocJobContext): string {
  const parts = [ctx.addressLine1, ctx.city, ctx.state, ctx.postalCode].filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : "—";
}

function orgAddress(ctx: PermitDocJobContext): string {
  const parts = [ctx.orgAddressLine1, ctx.orgCity, ctx.orgState, ctx.orgPostalCode].filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : ctx.orgName;
}

function waterLabel(ctx: PermitDocJobContext): string {
  if (ctx.waterService === "CITY") return "City water (JEA)";
  if (ctx.waterService === "SEPTIC") return "Septic";
  return "Not set";
}

/** Kinds that have a printable WCI worksheet today (not external stubs). */
export const PRINTABLE_PERMIT_DOC_KINDS: readonly PermitDocKind[] = [
  "NOC",
  "NTBO",
  "BUILDING_PERMIT_APPLICATION",
] as const;

export function generatePermitDoc(kind: PermitDocKind, ctx: PermitDocJobContext): GeneratedPermitDoc | null {
  if (kind === "NOC") {
    return {
      kind,
      title: "Notice of Commencement",
      subtitle: "Duval County / City of Jacksonville — Florida Statutes §713.13 worksheet",
      legalNote:
        "This is a WCI-filled worksheet for recording preparation. Confirm statutory form language with counsel / clerk before recording. Recorded NOC is required before first inspection in Duval.",
      fields: [
        { label: "Job / improvement", value: ctx.jobName },
        { label: "Legal description / lot", value: ctx.lotInfo?.trim() || "—" },
        { label: "Property address", value: jobAddress(ctx) },
        { label: "Owner / contracting party", value: "See client of record on job" },
        { label: "Contractor", value: ctx.orgName },
        { label: "Contractor address", value: orgAddress(ctx) },
        { label: "Contractor phone", value: ctx.orgPhone?.trim() || "904-717-1729" },
        { label: "Contractor email", value: ctx.orgEmail?.trim() || "—" },
        { label: "Building permit #", value: ctx.permitNumber?.trim() || "—" },
        { label: "NOC on file in WCI OS", value: ctx.nocOnFile ? "Yes" : "No — still to record" },
      ],
      checklist: [
        "Verify owner name and legal description against deed / survey",
        "Attach contractor license info required by clerk",
        "Record with Duval Clerk of Court before first inspection",
        "Toggle NOC on file on the job Permitting page after recording",
      ],
    };
  }

  if (kind === "NTBO") {
    return {
      kind,
      title: "Notice to Building Official",
      subtitle: "City of Jacksonville — construction start notice worksheet",
      legalNote:
        "WCI worksheet for NTBO filing under the building permit. Confirm current city form / EPICS fields before submit.",
      fields: [
        { label: "Job", value: ctx.jobName },
        { label: "Site address", value: jobAddress(ctx) },
        { label: "Building permit #", value: ctx.permitNumber?.trim() || "—" },
        { label: "Contractor", value: ctx.orgName },
        { label: "Contractor contact", value: ctx.orgPhone?.trim() || "904-717-1729" },
        { label: "Trades on this job", value: ctx.permitTrades.length ? ctx.permitTrades.join(", ") : "Building (add MEP/roofing on Permitting as needed)" },
        { label: "Approx. heated sq ft", value: ctx.sqft != null ? String(ctx.sqft) : "—" },
        { label: "NTBO marked filed in WCI OS", value: ctx.ntboFiled ? "Yes" : "No — still to file" },
      ],
      checklist: [
        "Confirm permit is pulled / active before filing NTBO",
        "File through city / EPICS channel used for this job",
        "Toggle NTBO filed on the job Permitting page after acceptance",
      ],
    };
  }

  if (kind === "BUILDING_PERMIT_APPLICATION") {
    return {
      kind,
      title: "Building permit application",
      subtitle: "City of Jacksonville / EPICS — application cover sheet (Duval first)",
      legalNote:
        "Filled from the WCI job record for staff/agent use. Final submission still goes through city EPICS / Permit Rockstar once that login is available; this sheet prevents blank packs.",
      fields: [
        { label: "Project name", value: ctx.jobName },
        { label: "Site address", value: jobAddress(ctx) },
        { label: "Lot / parcel notes", value: ctx.lotInfo?.trim() || "—" },
        { label: "Existing permit #", value: ctx.permitNumber?.trim() || "—" },
        { label: "Applicant / contractor", value: ctx.orgName },
        { label: "Business address", value: orgAddress(ctx) },
        { label: "Phone", value: ctx.orgPhone?.trim() || "904-717-1729" },
        { label: "Email", value: ctx.orgEmail?.trim() || "—" },
        { label: "Water service", value: waterLabel(ctx) },
        { label: "Bathroom addition in scope", value: ctx.bathroomAdd ? "Yes" : "No" },
        { label: "Sq ft (if known)", value: ctx.sqft != null ? String(ctx.sqft) : "—" },
        { label: "Permits selected on job", value: ctx.permitTrades.length ? ctx.permitTrades.join(", ") : "None yet — add on Permitting" },
      ],
      checklist: [
        "Attach plans / product approvals as required by scope",
        "If bathroom add + city water: include JEA letter/bill",
        "If septic: include health department letter path",
        "Mark building permit docs created on Permitting after pack is complete",
      ],
    };
  }

  return null;
}

export function generatePrintablePack(
  kinds: readonly PermitDocKind[],
  ctx: PermitDocJobContext,
): readonly GeneratedPermitDoc[] {
  const out: GeneratedPermitDoc[] = [];
  for (const kind of kinds) {
    const doc = generatePermitDoc(kind, ctx);
    if (doc) out.push(doc);
  }
  return out;
}
