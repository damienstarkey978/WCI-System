/**
 * Map package / job / license / NOC-preset data onto AcroForm field names for the
 * three sourced Jacksonville blanks (NOC, Property Owner Authorization, PAIS).
 *
 * Field *names* come from the official PDFs (often truncated). Values come only
 * from WCI records / staff wizard input — never invented statutory wording.
 */

import type { PdfFieldWrites } from "@/lib/permitting/fill-pdf";

export type PackageFillOwner = {
  readonly name?: string | null;
  readonly mailingAddress?: string | null;
  readonly cityStateZip?: string | null;
  readonly phone?: string | null;
  readonly cellPhone?: string | null;
  readonly email?: string | null;
};

export type PackageFillContractor = {
  readonly companyName?: string | null;
  readonly qualifierName?: string | null;
  readonly licenseNumber?: string | null;
  readonly addressLine?: string | null;
  readonly phone?: string | null;
  readonly email?: string | null;
};

export type PackageFillContext = {
  readonly packageName: string;
  readonly propertyAddress: string;
  readonly legalDescription?: string | null;
  readonly taxFolio?: string | null;
  readonly permitNumber?: string | null;
  readonly descriptionOfImprovement?: string | null;
  readonly descriptionOfWork?: string | null;
  readonly ownersInterest?: string | null;
  readonly designatedPersonForNotices?: string | null;
  readonly lienorsNoticeRecipient?: string | null;
  readonly expirationRule?: string | null;
  readonly owner: PackageFillOwner;
  readonly contractor: PackageFillContractor;
  /** PAIS product rows already shaped for AcroForm slots (batch 2: header only if empty). */
  readonly paisProducts?: readonly {
    readonly categorySlot: string;
    readonly manufacturer?: string | null;
    readonly productDescription?: string | null;
    readonly codeVersion?: string | null;
    readonly flNumber?: string | null;
    readonly qaExpiration?: string | null;
  }[];
};

function trim(value: string | null | undefined): string {
  return (value ?? "").trim();
}

function splitTwoLines(text: string, max = 90): readonly [string, string] {
  const t = text.trim();
  if (t.length <= max) return [t, ""];
  const cut = t.lastIndexOf(" ", max);
  const at = cut > 40 ? cut : max;
  return [t.slice(0, at).trim(), t.slice(at).trim()];
}

/** Notice of Commencement — Jacksonville Rev 4-14-2026 AcroForm names. */
export function nocFieldWrites(ctx: PackageFillContext): PdfFieldWrites {
  const [desc1, desc2] = splitTwoLines(trim(ctx.descriptionOfImprovement) || trim(ctx.packageName));
  const contractorName =
    trim(ctx.contractor.companyName) || trim(ctx.contractor.qualifierName);
  const contractorAddr = trim(ctx.contractor.addressLine);
  const ownerName = trim(ctx.owner.name);
  const ownerAddr = [trim(ctx.owner.mailingAddress), trim(ctx.owner.cityStateZip)]
    .filter(Boolean)
    .join(", ");

  const designated = trim(ctx.designatedPersonForNotices);
  const lienor = trim(ctx.lienorsNoticeRecipient);

  return {
    text: {
      "Permit No": trim(ctx.permitNumber),
      "Tax Folio No": trim(ctx.taxFolio),
      "Legal description of property": trim(ctx.legalDescription),
      "Address of property being": trim(ctx.propertyAddress),
      // Official field names are truncated OCR of the blank labels.
      mproved: desc1,
      mprovements: desc2,
      Owner: ownerName,
      Address: ownerAddr,
      "te of the improvement": trim(ctx.ownersInterest) || "Fee Simple",
      // Fee-simple titleholder block (often same as owner).
      Name: ownerName,
      Address_2: ownerAddr,
      Contractor: contractorName,
      Address_3: contractorAddr,
      "Phone No": trim(ctx.contractor.phone),
      Name_3: designated,
      Name_4: lienor,
      ed: trim(ctx.expirationRule) || "1 year after recording",
    },
  };
}

/** Property Owner Authorization Form — Jacksonville Rev 8-6-2026. */
export function permissionByOwnerFieldWrites(ctx: PackageFillContext): PdfFieldWrites {
  const work = trim(ctx.descriptionOfWork) || trim(ctx.descriptionOfImprovement) || trim(ctx.packageName);
  const [work1, work2] = splitTwoLines(work, 70);
  return {
    text: {
      "Property Owner Name": trim(ctx.owner.name),
      "Mailing Address": trim(ctx.owner.mailingAddress),
      "City/State/Zip": trim(ctx.owner.cityStateZip),
      Phone: trim(ctx.owner.phone),
      "Cell Phone": trim(ctx.owner.cellPhone),
      "Email Address": trim(ctx.owner.email),
      "Project Address": trim(ctx.propertyAddress),
      "Company / Contractor Name":
        trim(ctx.contractor.companyName) || trim(ctx.contractor.qualifierName),
      "Contractor / MH Installer License Number": trim(ctx.contractor.licenseNumber),
      "Description of Work 1": work1,
      "Description of Work 2": work2,
      "Print Name": trim(ctx.owner.name),
      "Name of Owner / Agent": trim(ctx.owner.name),
    },
    checks: {
      // Default: city plans review path; private-provider path left unchecked.
      "Plans Review": true,
      "No I will not be us": true,
    },
  };
}

/** Product Approval Information Sheet — Jacksonville Rev 4-9-2026 (header + optional rows). */
export function paisFieldWrites(ctx: PackageFillContext): PdfFieldWrites {
  const text: Record<string, string> = {
    "Permit Number": trim(ctx.permitNumber),
    "Project Name": trim(ctx.packageName),
    "Project Address": trim(ctx.propertyAddress),
    Contractor: trim(ctx.contractor.companyName) || trim(ctx.contractor.qualifierName),
  };

  for (const row of ctx.paisProducts ?? []) {
    const slot = row.categorySlot.trim();
    if (!slot) continue;
    if (row.manufacturer) text[`Manufacturer${slot}`] = trim(row.manufacturer);
    if (row.productDescription) {
      text[`Product Description${slot}`] = trim(row.productDescription);
    }
    if (row.codeVersion) text[`Code Version${slot}`] = trim(row.codeVersion);
    if (row.flNumber) text[`FL include suffix${slot}`] = trim(row.flNumber);
    if (row.qaExpiration) {
      text[`Quality Assurance Expiration Date${slot}`] = trim(row.qaExpiration);
    }
  }

  return { text };
}

export function fieldWritesForFormKey(
  formKey: string,
  ctx: PackageFillContext,
): PdfFieldWrites | null {
  switch (formKey) {
    case "noc":
      return nocFieldWrites(ctx);
    case "permission_by_owner":
      return permissionByOwnerFieldWrites(ctx);
    case "pais":
      return paisFieldWrites(ctx);
    default:
      return null;
  }
}
