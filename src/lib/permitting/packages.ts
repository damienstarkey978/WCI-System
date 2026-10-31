/**
 * Permit package aggregate (job-level). Batch 1 creates DRAFT packages with
 * selected form rows — PDF fill / wizard UI land in later batches.
 * Never submits externally.
 */

import {
  PackagePermitType,
  PermitPackageFormStatus,
  PermitPackageStatus,
} from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import {
  formTitleForKey,
  formsForCatalog,
  type PermitCatalogMunicipality,
  type PermitCatalogPermitType,
} from "@/lib/permitting/form-catalog";

export class PermitPackageError extends Error {
  constructor(
    message: string,
    readonly code: "not_found" | "validation" = "validation",
  ) {
    super(message);
    this.name = "PermitPackageError";
  }
}

export type CreatePermitPackageInput = {
  readonly name: string;
  readonly county?: string;
  readonly municipality?: PermitCatalogMunicipality | string | null;
  readonly permitType?: PackagePermitType;
  readonly propertyAddress?: string | null;
  readonly jobPermitId?: string | null;
  readonly contractorLicenseId?: string | null;
  readonly designProfessionalId?: string | null;
  readonly formKeys?: readonly string[];
  readonly automateWithCity?: boolean;
};

function toCatalogPermitType(t: PackagePermitType): PermitCatalogPermitType {
  switch (t) {
    case PackagePermitType.BUILDING:
      return "BUILDING";
    case PackagePermitType.ELECTRICAL:
      return "ELECTRICAL";
    case PackagePermitType.FIRE:
      return "FIRE";
    case PackagePermitType.MECHANICAL:
      return "MECHANICAL";
    case PackagePermitType.PLUMBING:
      return "PLUMBING";
    case PackagePermitType.ROOFING:
      return "ROOFING";
    default:
      return "OTHER";
  }
}

export async function listPermitPackagesForJob(organizationId: string, jobId: string) {
  return db.permitPackage.findMany({
    where: { organizationId, jobId },
    include: {
      forms: { orderBy: { sortOrder: "asc" } },
      contractorLicense: true,
    },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
  });
}

export async function getPermitPackage(organizationId: string, packageId: string) {
  const row = await db.permitPackage.findFirst({
    where: { id: packageId, organizationId },
    include: {
      forms: { orderBy: { sortOrder: "asc" } },
      products: { orderBy: { sortOrder: "asc" } },
      contractorLicense: true,
      designProfessional: true,
      jobPermit: true,
    },
  });
  if (!row) throw new PermitPackageError("Permit package not found.", "not_found");
  return row;
}

export async function createPermitPackage(
  organizationId: string,
  jobId: string,
  input: CreatePermitPackageInput,
) {
  const job = await db.job.findFirst({ where: { id: jobId, organizationId }, select: { id: true } });
  if (!job) throw new PermitPackageError("Job not found.", "not_found");

  const name = input.name.trim();
  if (!name) throw new PermitPackageError("Package name is required.");

  const county = (input.county ?? "DUVAL").trim().toUpperCase() || "DUVAL";
  const municipality = (input.municipality ?? "JACKSONVILLE").toString();
  const permitType = input.permitType ?? PackagePermitType.BUILDING;

  if (input.automateWithCity) {
    // Toggle may be stored, but batch 1 never initiates city work.
  }

  const catalog = formsForCatalog({
    county: "DUVAL",
    municipality: municipality as PermitCatalogMunicipality,
    permitType: toCatalogPermitType(permitType),
  });

  const selectedKeys =
    input.formKeys && input.formKeys.length > 0
      ? input.formKeys
      : catalog.filter((f) => f.preselected).map((f) => f.key);

  if (selectedKeys.length === 0) {
    throw new PermitPackageError("Select at least one form.");
  }

  if (input.jobPermitId) {
    const permit = await db.jobPermit.findFirst({
      where: { id: input.jobPermitId, jobId, organizationId },
      select: { id: true },
    });
    if (!permit) throw new PermitPackageError("Job permit not found.", "not_found");
  }

  if (input.contractorLicenseId) {
    const lic = await db.contractorLicense.findFirst({
      where: { id: input.contractorLicenseId, organizationId },
      select: { id: true },
    });
    if (!lic) throw new PermitPackageError("Contractor license not found.", "not_found");
  }

  const formRows = selectedKeys.map((formKey, index) => ({
    formKey,
    title: formTitleForKey(formKey),
    sortOrder: index,
    status: PermitPackageFormStatus.DRAFT,
  }));

  return db.permitPackage.create({
    data: {
      organizationId,
      jobId,
      jobPermitId: input.jobPermitId ?? null,
      name,
      county,
      municipality,
      permitType,
      propertyAddress: input.propertyAddress?.trim() || null,
      status: PermitPackageStatus.ACTIVE,
      contractorLicenseId: input.contractorLicenseId ?? null,
      designProfessionalId: input.designProfessionalId ?? null,
      automateWithCity: Boolean(input.automateWithCity),
      packageCreatedAt: new Date(),
      forms: { create: formRows },
    },
    include: { forms: { orderBy: { sortOrder: "asc" } } },
  });
}

export async function archivePermitPackage(organizationId: string, packageId: string) {
  await getPermitPackage(organizationId, packageId);
  return db.permitPackage.update({
    where: { id: packageId },
    data: { status: PermitPackageStatus.ARCHIVED },
  });
}
