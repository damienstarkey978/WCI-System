import { readFileSync } from "node:fs";
import path from "node:path";

import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";

import { fillOfficialPermitPdf } from "@/lib/permitting/fill-pdf";
import { loadDuvalJaxManifest } from "@/lib/permitting/form-manifest";
import {
  nocFieldWrites,
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

describe("duval-jax official form blanks", () => {
  it("marks NOC, Owner Authorization, and PAIS available with source + revision", () => {
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
});
