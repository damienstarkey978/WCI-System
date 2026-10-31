/**
 * Permit package aggregate (job-level).
 * Batch 2–3: wizard creates packages + fills sourced Jacksonville official PDFs.
 * Batch 4: package detail panel helpers (status tabs, rename/remove, merged PDF).
 * Never submits externally.
 */

import type { Prisma } from "@/generated/prisma/client";
import {
  PackagePermitType,
  PermitPackageFormStatus,
  PermitPackageStatus,
} from "@/generated/prisma/enums";
import { PDFDocument } from "pdf-lib";
import { db } from "@/lib/db";
import { fillOfficialPermitPdf, PermitPdfFillError } from "@/lib/permitting/fill-pdf";
import { isOfficialFormAvailable } from "@/lib/permitting/form-manifest";
import {
  formTitleForKey,
  formsForCatalog,
  type PermitCatalogMunicipality,
  type PermitCatalogPermitType,
} from "@/lib/permitting/form-catalog";
import {
  fieldWritesForFormKey,
  type PackageFillContext,
} from "@/lib/permitting/package-form-fill";

export class PermitPackageError extends Error {
  constructor(
    message: string,
    readonly code: "not_found" | "validation" | "unavailable" = "validation",
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
  readonly fieldValues?: Prisma.InputJsonValue;
};

export type PackageFieldValues = {
  readonly ownerName?: string;
  readonly ownerMailingAddress?: string;
  readonly ownerCityStateZip?: string;
  readonly ownerPhone?: string;
  readonly ownerCellPhone?: string;
  readonly ownerEmail?: string;
  readonly legalDescription?: string;
  readonly taxFolio?: string;
  readonly permitNumber?: string;
  readonly descriptionOfImprovement?: string;
  readonly descriptionOfWork?: string;
  readonly ownersInterest?: string;
  readonly designatedPersonForNotices?: string;
  readonly lienorsNoticeRecipient?: string;
  readonly expirationRule?: string;
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

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function strField(bag: Record<string, unknown>, key: string): string {
  const v = bag[key];
  return typeof v === "string" ? v.trim() : "";
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

function formatLicenseAddress(license: {
  addressLine1: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
}): string {
  const line1 = license.addressLine1?.trim() ?? "";
  const cityLine = [license.city, license.state, license.postalCode].filter(Boolean).join(", ");
  return [line1, cityLine].filter(Boolean).join(", ");
}

export async function buildPackageFillContext(
  organizationId: string,
  packageId: string,
): Promise<PackageFillContext> {
  const pkg = await getPermitPackage(organizationId, packageId);
  const bag = asRecord(pkg.fieldValues);
  const license = pkg.contractorLicense;

  const nocPreset = await db.nocPreset.findFirst({
    where: { organizationId, county: pkg.county },
  });

  const job = await db.job.findFirst({
    where: { id: pkg.jobId, organizationId },
    select: {
      name: true,
      permitNumber: true,
      lotInfo: true,
      addressLine1: true,
      city: true,
      state: true,
      postalCode: true,
    },
  });

  const clientAccess = await db.clientJobAccess.findFirst({
    where: { jobId: pkg.jobId },
    include: { client: true },
    orderBy: { createdAt: "asc" },
  });
  const client = clientAccess?.client;

  const propertyAddress =
    pkg.propertyAddress?.trim() ||
    [job?.addressLine1, job?.city, job?.state, job?.postalCode].filter(Boolean).join(", ") ||
    "";

  const ownerCityStateZip =
    strField(bag, "ownerCityStateZip") ||
    [client?.city, client?.state, client?.postalCode].filter(Boolean).join(", ");

  return {
    packageName: pkg.name,
    propertyAddress,
    legalDescription: strField(bag, "legalDescription") || job?.lotInfo || "",
    taxFolio: strField(bag, "taxFolio"),
    permitNumber:
      strField(bag, "permitNumber") ||
      pkg.jobPermit?.permitNumber ||
      job?.permitNumber ||
      "",
    descriptionOfImprovement:
      strField(bag, "descriptionOfImprovement") ||
      nocPreset?.descriptionOfImprovement ||
      job?.name ||
      pkg.name,
    descriptionOfWork: strField(bag, "descriptionOfWork"),
    ownersInterest:
      strField(bag, "ownersInterest") || nocPreset?.ownersInterest || "Fee Simple",
    designatedPersonForNotices:
      strField(bag, "designatedPersonForNotices") ||
      nocPreset?.designatedPersonForNotices ||
      "",
    lienorsNoticeRecipient:
      strField(bag, "lienorsNoticeRecipient") || nocPreset?.lienorsNoticeRecipient || "",
    expirationRule:
      strField(bag, "expirationRule") ||
      nocPreset?.expirationRule ||
      "1 year after recording",
    owner: {
      name: strField(bag, "ownerName") || client?.name || "",
      mailingAddress: strField(bag, "ownerMailingAddress") || client?.addressLine1 || "",
      cityStateZip: ownerCityStateZip,
      phone: strField(bag, "ownerPhone") || client?.phone || "",
      cellPhone: strField(bag, "ownerCellPhone") || client?.cellPhone || "",
      email: strField(bag, "ownerEmail") || client?.email || "",
    },
    contractor: {
      companyName: license?.companyName ?? "",
      qualifierName: license?.qualifierName ?? "",
      licenseNumber: license?.licenseNumber ?? "",
      addressLine: license ? formatLicenseAddress(license) : "",
      phone: license?.phone ?? "",
      email: license?.email ?? "",
    },
    paisProducts: pkg.products.map((p, index) => ({
      // Uncategorized exterior product rows on the official PAIS blank (Manufacturer1…).
      categorySlot: String(index + 1),
      manufacturer: p.manufacturer,
      productDescription: [p.model, p.notes].filter(Boolean).join(" — ") || p.category,
      flNumber: p.approvalNumber,
    })),
  };
}

export async function generateFilledFormPdf(
  organizationId: string,
  packageId: string,
  formKey: string,
): Promise<{ bytes: Uint8Array; title: string; fileName: string }> {
  const pkg = await getPermitPackage(organizationId, packageId);
  const formRow = pkg.forms.find((f) => f.formKey === formKey);
  if (!formRow) {
    throw new PermitPackageError(`Form "${formKey}" is not on this package.`, "not_found");
  }
  if (!isOfficialFormAvailable(formKey)) {
    throw new PermitPackageError(
      `Official PDF for "${formKey}" is not sourced yet.`,
      "unavailable",
    );
  }

  const ctx = await buildPackageFillContext(organizationId, packageId);
  const writes = fieldWritesForFormKey(formKey, ctx);
  if (!writes) {
    throw new PermitPackageError(`No fill mapping for "${formKey}".`, "unavailable");
  }

  try {
    const bytes = await fillOfficialPermitPdf(formKey, writes);
    const safeName = pkg.name.replace(/[^\w.-]+/g, "_").slice(0, 40);
    return {
      bytes,
      title: formRow.title,
      fileName: `${safeName}-${formKey}.pdf`,
    };
  } catch (error) {
    if (error instanceof PermitPdfFillError) {
      throw new PermitPackageError(error.message, error.code === "unavailable" ? "unavailable" : "validation");
    }
    throw error;
  }
}

/** Mark sourced forms CREATED after a successful fill smoke (no external submit). */
export async function markPackageFormsCreated(organizationId: string, packageId: string) {
  const pkg = await getPermitPackage(organizationId, packageId);
  const fillable = pkg.forms.filter((f) => isOfficialFormAvailable(f.formKey));
  for (const form of fillable) {
    // Ensure fill succeeds before flipping status.
    await generateFilledFormPdf(organizationId, packageId, form.formKey);
    await db.permitPackageForm.update({
      where: { id: form.id },
      data: {
        status: PermitPackageFormStatus.CREATED,
        fieldValues: asRecord(pkg.fieldValues) as Prisma.InputJsonValue,
      },
    });
  }

  const hasNoc = fillable.some((f) => f.formKey === "noc");
  return db.permitPackage.update({
    where: { id: packageId },
    data: {
      nocCreatedAt: hasNoc ? new Date() : pkg.nocCreatedAt,
      packageCreatedAt: pkg.packageCreatedAt ?? new Date(),
    },
    include: { forms: { orderBy: { sortOrder: "asc" } } },
  });
}

export async function updatePermitPackageFields(
  organizationId: string,
  packageId: string,
  fields: PackageFieldValues,
) {
  await getPermitPackage(organizationId, packageId);
  const next: Record<string, string> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (typeof value === "string" && value.trim()) next[key] = value.trim();
  }
  return db.permitPackage.update({
    where: { id: packageId },
    data: { fieldValues: next },
    include: { forms: { orderBy: { sortOrder: "asc" } } },
  });
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
    // Toggle may be stored, but never initiates city work without an explicit later click.
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

  const created = await db.permitPackage.create({
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
      fieldValues: input.fieldValues ?? {},
      forms: { create: formRows },
    },
    include: { forms: { orderBy: { sortOrder: "asc" } } },
  });

  // Auto-fill any sourced blanks so staff can download immediately (no external submit).
  const sourced = selectedKeys.filter((k) => isOfficialFormAvailable(k));
  if (sourced.length > 0) {
    try {
      return await markPackageFormsCreated(organizationId, created.id);
    } catch {
      // Keep the draft package even if fill fails (e.g. missing blank on disk).
      return created;
    }
  }

  return created;
}

export async function archivePermitPackage(organizationId: string, packageId: string) {
  await getPermitPackage(organizationId, packageId);
  return db.permitPackage.update({
    where: { id: packageId },
    data: { status: PermitPackageStatus.ARCHIVED },
  });
}

export async function setPermitPackageStatus(
  organizationId: string,
  packageId: string,
  status: PermitPackageStatus,
) {
  await getPermitPackage(organizationId, packageId);
  return db.permitPackage.update({
    where: { id: packageId },
    data: { status },
    include: { forms: { orderBy: { sortOrder: "asc" } } },
  });
}

export async function renamePermitPackage(
  organizationId: string,
  packageId: string,
  name: string,
) {
  const trimmed = name.trim();
  if (!trimmed) throw new PermitPackageError("Package name is required.");
  await getPermitPackage(organizationId, packageId);
  return db.permitPackage.update({
    where: { id: packageId },
    data: { name: trimmed },
    include: { forms: { orderBy: { sortOrder: "asc" } } },
  });
}

export async function removePermitPackage(organizationId: string, packageId: string) {
  await getPermitPackage(organizationId, packageId);
  await db.permitPackage.delete({ where: { id: packageId } });
}

export async function linkPackageJobPermit(
  organizationId: string,
  packageId: string,
  jobPermitId: string | null,
) {
  const pkg = await getPermitPackage(organizationId, packageId);
  if (jobPermitId) {
    const permit = await db.jobPermit.findFirst({
      where: { id: jobPermitId, jobId: pkg.jobId, organizationId },
      select: { id: true },
    });
    if (!permit) throw new PermitPackageError("Job permit not found.", "not_found");
  }
  return db.permitPackage.update({
    where: { id: packageId },
    data: { jobPermitId },
    include: {
      forms: { orderBy: { sortOrder: "asc" } },
      jobPermit: true,
      contractorLicense: true,
    },
  });
}

/** Mark a form Downloaded after staff opens/downloads it (local status only). */
export async function markPackageFormDownloaded(
  organizationId: string,
  packageId: string,
  formKey: string,
) {
  const pkg = await getPermitPackage(organizationId, packageId);
  const form = pkg.forms.find((f) => f.formKey === formKey);
  if (!form) throw new PermitPackageError(`Form "${formKey}" is not on this package.`, "not_found");
  // Don't downgrade notarized/recorded — only promote draft/created → downloaded.
  if (
    form.status === PermitPackageFormStatus.NOTARIZED ||
    form.status === PermitPackageFormStatus.RECORDED ||
    form.status === PermitPackageFormStatus.DOWNLOADED
  ) {
    return form;
  }
  return db.permitPackageForm.update({
    where: { id: form.id },
    data: { status: PermitPackageFormStatus.DOWNLOADED },
  });
}

/** Re-fill one sourced form from current package fields (no external submit). */
export async function regeneratePackageForm(
  organizationId: string,
  packageId: string,
  formKey: string,
) {
  const filled = await generateFilledFormPdf(organizationId, packageId, formKey);
  const pkg = await getPermitPackage(organizationId, packageId);
  const form = pkg.forms.find((f) => f.formKey === formKey);
  if (!form) throw new PermitPackageError(`Form "${formKey}" is not on this package.`, "not_found");

  const nextStatus =
    form.status === PermitPackageFormStatus.DRAFT
      ? PermitPackageFormStatus.CREATED
      : form.status;

  await db.permitPackageForm.update({
    where: { id: form.id },
    data: {
      status: nextStatus,
      fieldValues: asRecord(pkg.fieldValues) as Prisma.InputJsonValue,
    },
  });

  if (formKey === "noc" && !pkg.nocCreatedAt) {
    await db.permitPackage.update({
      where: { id: packageId },
      data: { nocCreatedAt: new Date() },
    });
  }

  return filled;
}

/**
 * Merge filled official form PDFs in package form order.
 * Skips unavailable / unmapped forms. Never submits externally.
 */
export async function generateMergedPackagePdf(
  organizationId: string,
  packageId: string,
): Promise<{ bytes: Uint8Array; fileName: string; formCount: number }> {
  const pkg = await getPermitPackage(organizationId, packageId);
  const ctx = await buildPackageFillContext(organizationId, packageId);
  const merged = await PDFDocument.create();
  let formCount = 0;

  for (const form of pkg.forms) {
    if (!isOfficialFormAvailable(form.formKey)) continue;
    const writes = fieldWritesForFormKey(form.formKey, ctx);
    if (!writes) continue;
    try {
      const filled = await fillOfficialPermitPdf(form.formKey, writes);
      const src = await PDFDocument.load(filled, { ignoreEncryption: true });
      const pages = await merged.copyPages(src, src.getPageIndices());
      for (const page of pages) merged.addPage(page);
      formCount += 1;
    } catch (error) {
      if (error instanceof PermitPdfFillError && error.code === "unavailable") continue;
      throw error;
    }
  }

  if (formCount === 0) {
    throw new PermitPackageError(
      "No sourced official forms are available to download for this package.",
      "unavailable",
    );
  }

  const bytes = await merged.save();
  const safeName = pkg.name.replace(/[^\w.-]+/g, "_").slice(0, 40);
  return {
    bytes,
    fileName: `${safeName}-permit-package.pdf`,
    formCount,
  };
}

export function packageGridFlags(pkg: {
  nocCreatedAt: Date | null;
  packageCreatedAt: Date | null;
  notarizedAt: Date | null;
  recordedAt: Date | null;
  initiatedAt: Date | null;
  createdAt: Date;
  forms: readonly { formKey: string; status: PermitPackageFormStatus }[];
}) {
  const nocCreated =
    pkg.nocCreatedAt != null ||
    pkg.forms.some(
      (f) =>
        f.formKey === "noc" &&
        f.status !== PermitPackageFormStatus.DRAFT,
    );
  const packageCreated =
    pkg.packageCreatedAt != null ||
    pkg.forms.some((f) => f.status !== PermitPackageFormStatus.DRAFT);
  return {
    nocCreated,
    packageCreated,
    notarized: pkg.notarizedAt != null,
    recorded: pkg.recordedAt != null,
    initiatedAt: pkg.initiatedAt ?? pkg.packageCreatedAt ?? pkg.createdAt,
  };
}
