/**
 * Map package / job / license / NOC-preset data onto AcroForm field names for
 * sourced Jacksonville blanks. Field *names* come from the official PDFs
 * (often truncated). Values come only from WCI records / staff wizard input —
 * never invented statutory wording.
 *
 * Forms with no AcroForm fields (flat/scanned blanks) return empty writes so
 * the official PDF is served as-is.
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

const EMPTY_WRITES: PdfFieldWrites = { text: {} };

function contractorDisplay(ctx: PackageFillContext): string {
  return trim(ctx.contractor.companyName) || trim(ctx.contractor.qualifierName);
}

function ownerMailingLine(ctx: PackageFillContext): string {
  return [trim(ctx.owner.mailingAddress), trim(ctx.owner.cityStateZip)]
    .filter(Boolean)
    .join(", ");
}

/** Notice of Commencement — Jacksonville Rev 4-14-2026 AcroForm names. */
export function nocFieldWrites(ctx: PackageFillContext): PdfFieldWrites {
  const [desc1, desc2] = splitTwoLines(trim(ctx.descriptionOfImprovement) || trim(ctx.packageName));
  const contractorName = contractorDisplay(ctx);
  const contractorAddr = trim(ctx.contractor.addressLine);
  const ownerName = trim(ctx.owner.name);
  const ownerAddr = ownerMailingLine(ctx);

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
  const work =
    trim(ctx.descriptionOfWork) ||
    trim(ctx.descriptionOfImprovement) ||
    trim(ctx.packageName);
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
      "Company / Contractor Name": contractorDisplay(ctx),
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
    Contractor: contractorDisplay(ctx),
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

/** Aluminum structure affidavit — Rev 4-13-2026. */
export function affidavitAluminumFieldWrites(ctx: PackageFillContext): PdfFieldWrites {
  const qualifier = trim(ctx.contractor.qualifierName);
  return {
    text: {
      "Permit Number": trim(ctx.permitNumber),
      "Property Owner Name": trim(ctx.owner.name),
      "Contractor Qualifier Name": qualifier,
      "License number": trim(ctx.contractor.licenseNumber),
      "Contractor Business Name": trim(ctx.contractor.companyName),
      "Project Address": trim(ctx.propertyAddress),
      "Qualifier Print Name": qualifier,
      "Printed Name": qualifier,
      "Qualifier Name": qualifier,
    },
  };
}

/** Change of Contractor Form Letter — Rev 4-15-2026. */
export function changeOfContractorFieldWrites(ctx: PackageFillContext): PdfFieldWrites {
  return {
    text: {
      "Applicants Name": trim(ctx.owner.name),
      "Applicants Address": ownerMailingLine(ctx),
      "the owner of the property at the above": trim(ctx.propertyAddress),
      "Name of Current Company": contractorDisplay(ctx),
      "New Contractor License": trim(ctx.contractor.licenseNumber),
      "New Qualifiers Name as appears on DBPR license": trim(ctx.contractor.qualifierName),
      Owner: trim(ctx.owner.name),
      Qualifier: trim(ctx.contractor.qualifierName),
    },
  };
}

/** Demolition Grassing Letter — Rev 4-1-2025. */
export function demolitionGrassingFieldWrites(ctx: PackageFillContext): PdfFieldWrites {
  return {
    text: {
      "Applicants Name": trim(ctx.owner.name) || contractorDisplay(ctx),
      "Applicants Address": ownerMailingLine(ctx) || trim(ctx.contractor.addressLine),
      "Demolition address": trim(ctx.propertyAddress),
      Contractor: contractorDisplay(ctx),
    },
  };
}

/** Emergency Reconnect Letter — Rev 3-31-2026. */
export function emergencyReconnectFieldWrites(ctx: PackageFillContext): PdfFieldWrites {
  return {
    text: {
      "Permit Number": trim(ctx.permitNumber),
      "Address of repair": trim(ctx.propertyAddress),
      "Nature of repair":
        trim(ctx.descriptionOfWork) || trim(ctx.descriptionOfImprovement),
      "Company Name": trim(ctx.contractor.companyName),
      "Contact person": trim(ctx.contractor.qualifierName),
      "Telephone Number": trim(ctx.contractor.phone),
      "Email address": trim(ctx.contractor.email),
      "Name of Qualifying Agent print": trim(ctx.contractor.qualifierName),
    },
  };
}

/** Existing Slab Affidavit — Rev 4-20-2026. */
export function existingSlabFieldWrites(ctx: PackageFillContext): PdfFieldWrites {
  const name = trim(ctx.owner.name) || contractorDisplay(ctx);
  return {
    text: {
      Address: trim(ctx.propertyAddress),
      Name: name,
      "Printed Name": name,
      "Printed Name_2": name,
    },
  };
}

/** HVAC / Property Owner Request for Inspection Exemption — Rev 3-26-2026. */
export function hvacInspectionExemptionFieldWrites(ctx: PackageFillContext): PdfFieldWrites {
  const contractorLine = [contractorDisplay(ctx), trim(ctx.contractor.addressLine)]
    .filter(Boolean)
    .join(" — ");
  return {
    text: {
      "Permit Number": trim(ctx.permitNumber),
      Address: trim(ctx.propertyAddress),
      "Contractor Name and Address": contractorLine,
      "Property Owner Printed Name": trim(ctx.owner.name),
    },
  };
}

/** Homeowner Sunroom Enclosure Affidavit — Rev 7-30-2026. */
export function homeownerSunroomFieldWrites(ctx: PackageFillContext): PdfFieldWrites {
  return {
    text: {
      "Name of Owner / Agent": trim(ctx.owner.name),
      "Print Name": trim(ctx.owner.name),
    },
  };
}

/** JaxEPICS Contractor Registration — Rev 3-27-2026. */
export function jaxEpicsRegistrationFieldWrites(ctx: PackageFillContext): PdfFieldWrites {
  return {
    text: {
      "License Number": trim(ctx.contractor.licenseNumber),
      "Company Name as appears on DBPR License": trim(ctx.contractor.companyName),
      "Mailing Address": trim(ctx.contractor.addressLine),
      "Business Address": trim(ctx.contractor.addressLine),
      Mobile: trim(ctx.contractor.phone),
      "Office Phone Number": trim(ctx.contractor.phone),
      "Company Email Address": trim(ctx.contractor.email),
      "Qualiﬁer’s Email Address": trim(ctx.contractor.email),
      "License Holder Printed Name": trim(ctx.contractor.qualifierName),
      "Qualifier's Name": trim(ctx.contractor.qualifierName),
      "Contractor applicant": trim(ctx.contractor.qualifierName),
    },
  };
}

/** Mobile Home Egress Requirements — Rev 3-30-2026. */
export function mobileHomeEgressFieldWrites(ctx: PackageFillContext): PdfFieldWrites {
  return {
    text: {
      "Installer License Number": trim(ctx.contractor.licenseNumber),
      "Installer Printed Name":
        trim(ctx.contractor.qualifierName) || trim(ctx.contractor.companyName),
    },
  };
}

/** Private Swimming Pool Safety Affirmation — Rev 6-2-2026. */
export function privatePoolSafetyFieldWrites(ctx: PackageFillContext): PdfFieldWrites {
  const qualifier = trim(ctx.contractor.qualifierName);
  return {
    text: {
      "Permit Number": trim(ctx.permitNumber),
      "Qualifiers License": trim(ctx.contractor.licenseNumber),
      Address: trim(ctx.propertyAddress),
      "print Qualifier’s name": qualifier,
      "Contractor Qualifier Print Name": qualifier,
      "Property Owner Print Name": trim(ctx.owner.name),
    },
  };
}

/**
 * NTBO — Notice to Building Official of Use of Private Provider.
 * Private-provider firm fields stay blank until staff enter them; only project /
 * fee-owner / contractor identity from the package is prefilled.
 */
export function ntboFieldWrites(ctx: PackageFillContext): PdfFieldWrites {
  const ownerAddr = ownerMailingLine(ctx);
  return {
    text: {
      "Project Name": trim(ctx.packageName),
      "Parcel Tax ID": trim(ctx.taxFolio),
      "Enter Name of fee owner or fee owner's contractor here":
        trim(ctx.owner.name) || contractorDisplay(ctx),
      "Print name": trim(ctx.owner.name),
      "Address line 1": trim(ctx.owner.mailingAddress) || trim(ctx.propertyAddress),
      "Address line 2": trim(ctx.owner.cityStateZip),
      "Telephone Number": trim(ctx.owner.phone),
      "Email Address_2": trim(ctx.owner.email),
      // Fee owner / contractor contact block (second column on blank).
      Address: ownerAddr || trim(ctx.propertyAddress),
      Telephone: trim(ctx.owner.phone) || trim(ctx.contractor.phone),
      "Email Address": trim(ctx.owner.email) || trim(ctx.contractor.email),
    },
  };
}

/**
 * Returns AcroForm writes for a sourced form key, or null when the key has no
 * mapping (should not happen for available manifest entries after batch 3).
 */
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
    case "affidavit_aluminum_structure":
      return affidavitAluminumFieldWrites(ctx);
    case "change_of_contractor":
      return changeOfContractorFieldWrites(ctx);
    case "demolition_grassing_letter":
      return demolitionGrassingFieldWrites(ctx);
    case "emergency_reconnect_letter":
      return emergencyReconnectFieldWrites(ctx);
    case "existing_slab_affidavit":
      return existingSlabFieldWrites(ctx);
    case "hvac_inspection_exemption":
      return hvacInspectionExemptionFieldWrites(ctx);
    case "homeowner_sunroom_enclosure":
      return homeownerSunroomFieldWrites(ctx);
    case "jaxepics_contractor_registration":
      return jaxEpicsRegistrationFieldWrites(ctx);
    case "mobile_home_egress":
      return mobileHomeEgressFieldWrites(ctx);
    case "private_pool_safety":
      return privatePoolSafetyFieldWrites(ctx);
    case "ntbo":
      return ntboFieldWrites(ctx);
    // Flat / scanned official blanks — serve as-is (no AcroForm fields).
    case "asbestos_requirements":
    case "septic_construction_permit":
    case "energy_form_r402":
      return EMPTY_WRITES;
    default:
      return null;
  }
}
