/**
 * Org-level Permit Rockstar settings: contractor licenses, NOC presets,
 * design professionals, form-set / PAIS templates, encrypted city portal
 * credentials. Used by /settings/permitting (batch 1).
 *
 * City portal passwords are encrypted at rest and never returned to the client.
 * Connecting credentials does NOT submit anything to EPICS/clerk.
 */

import type { Prisma } from "@/generated/prisma/client";
import {
  CityPortalKind,
  DesignProfessionalKind,
  PackagePermitType,
} from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { decryptPortalPassword, encryptPortalPassword } from "@/lib/permitting/portal-crypto";

export class PermitSettingsError extends Error {
  constructor(
    message: string,
    readonly code:
      | "not_found"
      | "validation"
      | "duplicate"
      | "encryption_not_configured" = "validation",
  ) {
    super(message);
    this.name = "PermitSettingsError";
  }
}

function trimOrNull(value: string | null | undefined): string | null {
  const t = value?.trim();
  return t ? t : null;
}

// ---------------------------------------------------------------------------
// Contractor licenses
// ---------------------------------------------------------------------------

export type ContractorLicenseInput = {
  readonly companyName: string;
  readonly qualifierName: string;
  readonly licenseType: string;
  readonly licenseNumber: string;
  readonly expiresAt?: Date | null;
  readonly active?: boolean;
  readonly addressLine1?: string | null;
  readonly city?: string | null;
  readonly state?: string | null;
  readonly postalCode?: string | null;
  readonly county?: string | null;
  readonly email?: string | null;
  readonly phone?: string | null;
  readonly sortOrder?: number;
};

export async function listContractorLicenses(organizationId: string) {
  return db.contractorLicense.findMany({
    where: { organizationId },
    orderBy: [{ sortOrder: "asc" }, { qualifierName: "asc" }],
  });
}

export async function createContractorLicense(organizationId: string, input: ContractorLicenseInput) {
  const companyName = input.companyName.trim();
  const qualifierName = input.qualifierName.trim();
  const licenseType = input.licenseType.trim();
  const licenseNumber = input.licenseNumber.trim();
  if (!companyName || !qualifierName || !licenseType || !licenseNumber) {
    throw new PermitSettingsError("Company, qualifier, license type, and number are required.");
  }
  try {
    return await db.contractorLicense.create({
      data: {
        organizationId,
        companyName,
        qualifierName,
        licenseType,
        licenseNumber,
        expiresAt: input.expiresAt ?? null,
        active: input.active ?? true,
        addressLine1: trimOrNull(input.addressLine1),
        city: trimOrNull(input.city),
        state: trimOrNull(input.state),
        postalCode: trimOrNull(input.postalCode),
        county: trimOrNull(input.county)?.toUpperCase() ?? null,
        email: trimOrNull(input.email),
        phone: trimOrNull(input.phone),
        sortOrder: input.sortOrder ?? 0,
      },
    });
  } catch (error) {
    if ((error as { code?: string }).code === "P2002") {
      throw new PermitSettingsError("A license with that number already exists.", "duplicate");
    }
    throw error;
  }
}

export async function updateContractorLicense(
  organizationId: string,
  licenseId: string,
  input: Partial<ContractorLicenseInput>,
) {
  const existing = await db.contractorLicense.findFirst({ where: { id: licenseId, organizationId } });
  if (!existing) throw new PermitSettingsError("License not found.", "not_found");
  try {
    return await db.contractorLicense.update({
      where: { id: licenseId },
      data: {
        ...(input.companyName !== undefined ? { companyName: input.companyName.trim() } : {}),
        ...(input.qualifierName !== undefined ? { qualifierName: input.qualifierName.trim() } : {}),
        ...(input.licenseType !== undefined ? { licenseType: input.licenseType.trim() } : {}),
        ...(input.licenseNumber !== undefined ? { licenseNumber: input.licenseNumber.trim() } : {}),
        ...(input.expiresAt !== undefined ? { expiresAt: input.expiresAt } : {}),
        ...(input.active !== undefined ? { active: input.active } : {}),
        ...(input.addressLine1 !== undefined ? { addressLine1: trimOrNull(input.addressLine1) } : {}),
        ...(input.city !== undefined ? { city: trimOrNull(input.city) } : {}),
        ...(input.state !== undefined ? { state: trimOrNull(input.state) } : {}),
        ...(input.postalCode !== undefined ? { postalCode: trimOrNull(input.postalCode) } : {}),
        ...(input.county !== undefined
          ? { county: trimOrNull(input.county)?.toUpperCase() ?? null }
          : {}),
        ...(input.email !== undefined ? { email: trimOrNull(input.email) } : {}),
        ...(input.phone !== undefined ? { phone: trimOrNull(input.phone) } : {}),
        ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
      },
    });
  } catch (error) {
    if ((error as { code?: string }).code === "P2002") {
      throw new PermitSettingsError("A license with that number already exists.", "duplicate");
    }
    throw error;
  }
}

export async function deleteContractorLicense(organizationId: string, licenseId: string) {
  const existing = await db.contractorLicense.findFirst({ where: { id: licenseId, organizationId } });
  if (!existing) throw new PermitSettingsError("License not found.", "not_found");
  await db.contractorLicense.delete({ where: { id: licenseId } });
}

/** Seed the live WCI CGC card when the org has no licenses yet (idempotent). */
export async function ensureDefaultWciContractorLicense(organizationId: string) {
  const count = await db.contractorLicense.count({ where: { organizationId } });
  if (count > 0) return null;
  return createContractorLicense(organizationId, {
    companyName: "World Construction CO INC",
    qualifierName: "SIMON P P CREWS",
    licenseType: "Certified General Contractor",
    licenseNumber: "CGC1504962",
    expiresAt: new Date("2026-08-31T12:00:00.000Z"),
    active: true,
    addressLine1: "6005 Powers Ave. #210",
    city: "Jacksonville",
    state: "FL",
    postalCode: "32217",
    county: "DUVAL",
    email: "damien@worldconstructioninc.com",
    phone: "904-717-1729",
  });
}

// ---------------------------------------------------------------------------
// NOC presets
// ---------------------------------------------------------------------------

export type NocPresetInput = {
  readonly county: string;
  readonly descriptionOfImprovement?: string | null;
  readonly ownersInterest?: string | null;
  readonly designatedPersonForNotices?: string | null;
  readonly lienorsNoticeRecipient?: string | null;
  readonly expirationRule?: string | null;
};

export async function listNocPresets(organizationId: string) {
  return db.nocPreset.findMany({
    where: { organizationId },
    orderBy: { county: "asc" },
  });
}

export async function upsertNocPreset(organizationId: string, input: NocPresetInput) {
  const county = input.county.trim().toUpperCase();
  if (!county) throw new PermitSettingsError("County is required.");
  return db.nocPreset.upsert({
    where: { organizationId_county: { organizationId, county } },
    create: {
      organizationId,
      county,
      descriptionOfImprovement: trimOrNull(input.descriptionOfImprovement),
      ownersInterest: trimOrNull(input.ownersInterest) ?? "Fee Simple",
      designatedPersonForNotices: trimOrNull(input.designatedPersonForNotices),
      lienorsNoticeRecipient: trimOrNull(input.lienorsNoticeRecipient),
      expirationRule: trimOrNull(input.expirationRule) ?? "1 year after recording",
    },
    update: {
      descriptionOfImprovement: trimOrNull(input.descriptionOfImprovement),
      ownersInterest: trimOrNull(input.ownersInterest) ?? "Fee Simple",
      designatedPersonForNotices: trimOrNull(input.designatedPersonForNotices),
      lienorsNoticeRecipient: trimOrNull(input.lienorsNoticeRecipient),
      expirationRule: trimOrNull(input.expirationRule) ?? "1 year after recording",
    },
  });
}

// ---------------------------------------------------------------------------
// Design professionals
// ---------------------------------------------------------------------------

export type DesignProfessionalInput = {
  readonly kind?: DesignProfessionalKind;
  readonly name: string;
  readonly firm?: string | null;
  readonly licenseNumber?: string | null;
  readonly addressLine1?: string | null;
  readonly city?: string | null;
  readonly state?: string | null;
  readonly postalCode?: string | null;
  readonly phone?: string | null;
  readonly email?: string | null;
};

export async function listDesignProfessionals(organizationId: string) {
  return db.designProfessional.findMany({
    where: { organizationId },
    orderBy: [{ kind: "asc" }, { name: "asc" }],
  });
}

export async function createDesignProfessional(
  organizationId: string,
  input: DesignProfessionalInput,
) {
  const name = input.name.trim();
  if (!name) throw new PermitSettingsError("Name is required.");
  return db.designProfessional.create({
    data: {
      organizationId,
      kind: input.kind ?? DesignProfessionalKind.ENGINEER,
      name,
      firm: trimOrNull(input.firm),
      licenseNumber: trimOrNull(input.licenseNumber),
      addressLine1: trimOrNull(input.addressLine1),
      city: trimOrNull(input.city),
      state: trimOrNull(input.state),
      postalCode: trimOrNull(input.postalCode),
      phone: trimOrNull(input.phone),
      email: trimOrNull(input.email),
    },
  });
}

export async function updateDesignProfessional(
  organizationId: string,
  id: string,
  input: Partial<DesignProfessionalInput>,
) {
  const existing = await db.designProfessional.findFirst({ where: { id, organizationId } });
  if (!existing) throw new PermitSettingsError("Design professional not found.", "not_found");
  return db.designProfessional.update({
    where: { id },
    data: {
      ...(input.kind !== undefined ? { kind: input.kind } : {}),
      ...(input.name !== undefined ? { name: input.name.trim() } : {}),
      ...(input.firm !== undefined ? { firm: trimOrNull(input.firm) } : {}),
      ...(input.licenseNumber !== undefined ? { licenseNumber: trimOrNull(input.licenseNumber) } : {}),
      ...(input.addressLine1 !== undefined ? { addressLine1: trimOrNull(input.addressLine1) } : {}),
      ...(input.city !== undefined ? { city: trimOrNull(input.city) } : {}),
      ...(input.state !== undefined ? { state: trimOrNull(input.state) } : {}),
      ...(input.postalCode !== undefined ? { postalCode: trimOrNull(input.postalCode) } : {}),
      ...(input.phone !== undefined ? { phone: trimOrNull(input.phone) } : {}),
      ...(input.email !== undefined ? { email: trimOrNull(input.email) } : {}),
    },
  });
}

export async function deleteDesignProfessional(organizationId: string, id: string) {
  const existing = await db.designProfessional.findFirst({ where: { id, organizationId } });
  if (!existing) throw new PermitSettingsError("Design professional not found.", "not_found");
  await db.designProfessional.delete({ where: { id } });
}

// ---------------------------------------------------------------------------
// Form-set templates
// ---------------------------------------------------------------------------

export type FormSetTemplateInput = {
  readonly name: string;
  readonly county: string;
  readonly municipality?: string | null;
  readonly permitType: PackagePermitType;
  readonly formKeys: readonly string[];
};

export async function listFormSetTemplates(organizationId: string) {
  return db.permitFormSetTemplate.findMany({
    where: { organizationId },
    orderBy: [{ county: "asc" }, { name: "asc" }],
  });
}

export async function createFormSetTemplate(organizationId: string, input: FormSetTemplateInput) {
  const name = input.name.trim();
  const county = input.county.trim().toUpperCase();
  if (!name || !county) throw new PermitSettingsError("Name and county are required.");
  if (!input.formKeys.length) throw new PermitSettingsError("Select at least one form.");
  try {
    return await db.permitFormSetTemplate.create({
      data: {
        organizationId,
        name,
        county,
        municipality: trimOrNull(input.municipality),
        permitType: input.permitType,
        formKeys: [...input.formKeys] as Prisma.InputJsonValue,
      },
    });
  } catch (error) {
    if ((error as { code?: string }).code === "P2002") {
      throw new PermitSettingsError("A template with that name already exists for this county/type.", "duplicate");
    }
    throw error;
  }
}

export async function deleteFormSetTemplate(organizationId: string, id: string) {
  const existing = await db.permitFormSetTemplate.findFirst({ where: { id, organizationId } });
  if (!existing) throw new PermitSettingsError("Template not found.", "not_found");
  await db.permitFormSetTemplate.delete({ where: { id } });
}

// ---------------------------------------------------------------------------
// PAIS product templates
// ---------------------------------------------------------------------------

export type PaisProductTemplateInput = {
  readonly name: string;
  readonly manufacturer?: string | null;
  readonly model?: string | null;
  readonly approvalNumber?: string | null;
  readonly category?: string | null;
  readonly notes?: string | null;
};

export async function listPaisProductTemplates(organizationId: string) {
  return db.paisProductTemplate.findMany({
    where: { organizationId },
    orderBy: { name: "asc" },
  });
}

export async function createPaisProductTemplate(
  organizationId: string,
  input: PaisProductTemplateInput,
) {
  const name = input.name.trim();
  if (!name) throw new PermitSettingsError("Name is required.");
  return db.paisProductTemplate.create({
    data: {
      organizationId,
      name,
      manufacturer: trimOrNull(input.manufacturer),
      model: trimOrNull(input.model),
      approvalNumber: trimOrNull(input.approvalNumber),
      category: trimOrNull(input.category),
      notes: trimOrNull(input.notes),
    },
  });
}

export async function deletePaisProductTemplate(organizationId: string, id: string) {
  const existing = await db.paisProductTemplate.findFirst({ where: { id, organizationId } });
  if (!existing) throw new PermitSettingsError("PAIS template not found.", "not_found");
  await db.paisProductTemplate.delete({ where: { id } });
}

// ---------------------------------------------------------------------------
// City portal credentials (encrypted) — connection only, never auto-submit
// ---------------------------------------------------------------------------

export type CityPortalPublicView = {
  readonly id: string;
  readonly portal: CityPortalKind;
  readonly username: string;
  readonly connected: boolean;
  readonly connectedAt: Date | null;
  readonly disconnectedAt: Date | null;
  readonly lastVerifiedAt: Date | null;
  /** Always false in API responses — password never leaves the server. */
  readonly hasPassword: true;
};

function toPublicCredential(row: {
  id: string;
  portal: CityPortalKind;
  username: string;
  connectedAt: Date;
  disconnectedAt: Date | null;
  lastVerifiedAt: Date | null;
}): CityPortalPublicView {
  return {
    id: row.id,
    portal: row.portal,
    username: row.username,
    connected: !row.disconnectedAt,
    connectedAt: row.connectedAt,
    disconnectedAt: row.disconnectedAt,
    lastVerifiedAt: row.lastVerifiedAt,
    hasPassword: true,
  };
}

export async function listCityPortalCredentials(organizationId: string): Promise<CityPortalPublicView[]> {
  const rows = await db.cityPortalCredential.findMany({ where: { organizationId } });
  return rows.map(toPublicCredential);
}

export async function connectCityPortalCredential(
  organizationId: string,
  input: { readonly portal: CityPortalKind; readonly username: string; readonly password: string },
): Promise<CityPortalPublicView> {
  const username = input.username.trim();
  const password = input.password;
  if (!username || !password) {
    throw new PermitSettingsError("Username and password are required.");
  }
  let encryptedPassword: string;
  try {
    encryptedPassword = encryptPortalPassword(password);
  } catch (error) {
    throw new PermitSettingsError(
      error instanceof Error ? error.message : "Encryption key not configured.",
      "encryption_not_configured",
    );
  }
  const row = await db.cityPortalCredential.upsert({
    where: { organizationId_portal: { organizationId, portal: input.portal } },
    create: {
      organizationId,
      portal: input.portal,
      username,
      encryptedPassword,
      connectedAt: new Date(),
      disconnectedAt: null,
    },
    update: {
      username,
      encryptedPassword,
      connectedAt: new Date(),
      disconnectedAt: null,
    },
  });
  return toPublicCredential(row);
}

export async function disconnectCityPortalCredential(
  organizationId: string,
  portal: CityPortalKind,
): Promise<CityPortalPublicView | null> {
  const existing = await db.cityPortalCredential.findUnique({
    where: { organizationId_portal: { organizationId, portal } },
  });
  if (!existing) return null;
  const row = await db.cityPortalCredential.update({
    where: { id: existing.id },
    data: { disconnectedAt: new Date() },
  });
  return toPublicCredential(row);
}

/**
 * Server-only: decrypt for an explicit staff-triggered EPICS worker (batch 5).
 * Callers must never send the result to the client or logs.
 */
export async function readCityPortalPasswordForWorker(
  organizationId: string,
  portal: CityPortalKind,
): Promise<{ username: string; password: string } | null> {
  const row = await db.cityPortalCredential.findUnique({
    where: { organizationId_portal: { organizationId, portal } },
  });
  if (!row || row.disconnectedAt) return null;
  return {
    username: row.username,
    password: decryptPortalPassword(row.encryptedPassword),
  };
}
