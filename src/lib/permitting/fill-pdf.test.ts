import { readFileSync } from "node:fs";
import path from "node:path";

import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";

import { fillOfficialPermitPdf } from "@/lib/permitting/fill-pdf";
import { clearDuvalJaxManifestCache, loadDuvalJaxManifest } from "@/lib/permitting/form-manifest";
import {
  affidavitAluminumFieldWrites,
  fieldWritesForFormKey,
  nocFieldWrites,
  ntboFieldWrites,
  paisFieldWrites,
  permissionByOwnerFieldWrites,
} from "@/lib/permitting/package-form-fill";

const sampleCtx = {
  packageName: "3640 Newcomb Rd Bldg1 — test",
  propertyAddress: "3640 Newcomb Rd, Jacksonville, FL",
  legalDescription: "Lot demo",
  taxFolio: "000000-0000",
  permitNumber: "",
  descriptionOfImprovement: "New single-family residence",
  ownersInterest: "Fee Simple",
  designatedPersonForNotices: "World Construction CO INC",
  lienorsNoticeRecipient: "",
  expirationRule: "1 year after recording",
  owner: {
    name: "Test Owner",
    mailingAddress: "100 Main St",
    cityStateZip: "Jacksonville, FL 32207",
    phone: "904-555-0100",
    email: "owner@example.com",
  },
  contractor: {
    companyName: "World Construction CO INC",
    qualifierName: "SIMON P P CREWS",
    licenseNumber: "CGC1504962",
    addressLine: "6005 Powers Ave. #210, Jacksonville, FL 32217",
    phone: "904-717-1729",
  },
};

const BATCH3_AVAILABLE = [
  "asbestos_requirements",
  "affidavit_aluminum_structure",
  "change_of_contractor",
  "demolition_grassing_letter",
  "emergency_reconnect_letter",
  "existing_slab_affidavit",
  "hvac_inspection_exemption",
  "homeowner_sunroom_enclosure",
  "jaxepics_contractor_registration",
  "mobile_home_egress",
  "private_pool_safety",
  "septic_construction_permit",
  "ntbo",
  "energy_form_r402",
] as const;

const STILL_UNAVAILABLE = [
  "affidavit_attaching_new_structure",
  "contractor_asbestos_notification",
  "affidavit_noc_filing",
  "reviewed_documents_sheet",
  "septic_site_plan_worksheet",
] as const;

describe("duval-jax official form blanks", () => {
  it("marks NOC, Owner Authorization, and PAIS available with source + revision", () => {
    clearDuvalJaxManifestCache();
    const manifest = loadDuvalJaxManifest();
    for (const key of ["noc", "permission_by_owner", "pais"] as const) {
      const entry = manifest.forms.find((f) => f.key === key);
      expect(entry?.status).toBe("available");
      expect(entry?.file).toBeTruthy();
      expect(entry?.sourceUrl).toMatch(/^https:\/\/www\.jacksonville\.gov\//);
      expect(entry?.revisionDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      const abs = path.join(process.cwd(), "public/permit-forms/duval-jax", entry!.file!);
      const header = readFileSync(abs).subarray(0, 5).toString("utf8");
      expect(header).toBe("%PDF-");
    }
  });

  it("marks batch-3 remaining Jacksonville forms available with real public sources", () => {
    clearDuvalJaxManifestCache();
    const manifest = loadDuvalJaxManifest();
    for (const key of BATCH3_AVAILABLE) {
      const entry = manifest.forms.find((f) => f.key === key);
      expect(entry?.status, key).toBe("available");
      expect(entry?.file, key).toBeTruthy();
      expect(entry?.sourceUrl, key).toMatch(/^https:\/\//);
      expect(entry?.revisionDate, key).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      const abs = path.join(process.cwd(), "public/permit-forms/duval-jax", entry!.file!);
      expect(readFileSync(abs).subarray(0, 5).toString("utf8"), key).toBe("%PDF-");
    }
    const energy = manifest.forms.find((f) => f.key === "energy_form_r402");
    expect(energy?.sourceUrl).toMatch(/floridabuilding\.org/);
  });

  it("leaves unsourced forms unavailable (no invented blanks)", () => {
    clearDuvalJaxManifestCache();
    const manifest = loadDuvalJaxManifest();
    for (const key of STILL_UNAVAILABLE) {
      const entry = manifest.forms.find((f) => f.key === key);
      expect(entry?.status, key).toBe("unavailable");
      expect(entry?.file, key).toBeNull();
      expect(entry?.sourceUrl, key).toBeNull();
      expect(entry?.notes, key).toBeTruthy();
    }
  });

  it("fills NOC AcroForm without inventing new field names", async () => {
    const bytes = await fillOfficialPermitPdf("noc", nocFieldWrites(sampleCtx));
    const doc = await PDFDocument.load(bytes);
    const form = doc.getForm();
    expect(form.getTextField("Address of property being").getText()).toContain("3640 Newcomb");
    expect(form.getTextField("Contractor").getText()).toContain("World Construction");
    expect(form.getTextField("te of the improvement").getText()).toBe("Fee Simple");
  });

  it("fills Property Owner Authorization header fields", async () => {
    const bytes = await fillOfficialPermitPdf(
      "permission_by_owner",
      permissionByOwnerFieldWrites(sampleCtx),
    );
    const doc = await PDFDocument.load(bytes);
    const form = doc.getForm();
    expect(form.getTextField("Property Owner Name").getText()).toBe("Test Owner");
    expect(form.getTextField("Contractor / MH Installer License Number").getText()).toBe(
      "CGC1504962",
    );
    expect(form.getTextField("Project Address").getText()).toContain("3640 Newcomb");
  });

  it("fills PAIS project header", async () => {
    const bytes = await fillOfficialPermitPdf("pais", paisFieldWrites(sampleCtx));
    const doc = await PDFDocument.load(bytes);
    const form = doc.getForm();
    expect(form.getTextField("Project Name").getText()).toContain("Newcomb");
    expect(form.getTextField("Contractor").getText()).toContain("World Construction");
  });

  it("fills aluminum affidavit + NTBO project identity from package context", async () => {
    const alum = await fillOfficialPermitPdf(
      "affidavit_aluminum_structure",
      affidavitAluminumFieldWrites(sampleCtx),
    );
    const alumForm = (await PDFDocument.load(alum)).getForm();
    expect(alumForm.getTextField("Project Address").getText()).toContain("3640 Newcomb");
    expect(alumForm.getTextField("License number").getText()).toBe("CGC1504962");

    const ntbo = await fillOfficialPermitPdf("ntbo", ntboFieldWrites(sampleCtx));
    const ntboForm = (await PDFDocument.load(ntbo)).getForm();
    expect(ntboForm.getTextField("Project Name").getText()).toContain("Newcomb");
    expect(ntboForm.getTextField("Parcel Tax ID").getText()).toBe("000000-0000");
  });

  it("has a fill mapping (or empty blank serve) for every available form key", () => {
    clearDuvalJaxManifestCache();
    const available = loadDuvalJaxManifest().forms.filter((f) => f.status === "available");
    expect(available.length).toBeGreaterThanOrEqual(17);
    for (const entry of available) {
      const writes = fieldWritesForFormKey(entry.key, sampleCtx);
      expect(writes, entry.key).not.toBeNull();
    }
  });

  it("serves flat official blanks (asbestos / septic / energy) without inventing fields", async () => {
    for (const key of [
      "asbestos_requirements",
      "septic_construction_permit",
      "energy_form_r402",
    ] as const) {
      const writes = fieldWritesForFormKey(key, sampleCtx);
      expect(writes).toEqual({ text: {} });
      const bytes = await fillOfficialPermitPdf(key, writes!);
      expect(bytes.byteLength).toBeGreaterThan(1000);
      const doc = await PDFDocument.load(bytes);
      expect(doc.getPageCount()).toBeGreaterThanOrEqual(1);
    }
  });
});
