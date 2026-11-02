/**
 * Confirm a Duval parcel onto a Job (address lock cache) for permit packages.
 * Never invents owner/folio — only persists a lookup result staff confirmed.
 */

import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import {
  DuvalParcelLookupError,
  packageFieldsFromParcel,
  toJobParcelSnapshot,
  type DuvalParcelResult,
} from "@/lib/permitting/duval-parcel";
import { PermitPackageError } from "@/lib/permitting/packages";

export class JobParcelCacheError extends Error {
  constructor(
    message: string,
    readonly code: "not_found" | "validation" = "validation",
  ) {
    super(message);
    this.name = "JobParcelCacheError";
  }
}

export async function confirmParcelOnJob(
  organizationId: string,
  jobId: string,
  parcel: DuvalParcelResult,
) {
  if (!parcel.parcelId?.trim()) {
    throw new JobParcelCacheError("Confirmed parcel is missing RE#.", "validation");
  }

  const job = await db.job.findFirst({
    where: { id: jobId, organizationId },
    select: { id: true, latitude: true, longitude: true },
  });
  if (!job) throw new JobParcelCacheError("Job not found.", "not_found");

  const confirmedAt = new Date();
  const snapshot = toJobParcelSnapshot(parcel, confirmedAt);

  const updated = await db.job.update({
    where: { id: jobId },
    data: {
      parcelId: parcel.parcelId,
      ownerOfRecord: parcel.ownerOfRecord || null,
      legalDescription: parcel.legalDescription || null,
      parcelConfirmedAt: confirmedAt,
      parcelSnapshot: snapshot as unknown as Prisma.InputJsonValue,
      // Prefer parcel coordinates when the job has none yet — never overwrite staff GPS.
      latitude: job.latitude == null && parcel.latitude != null ? parcel.latitude : undefined,
      longitude: job.longitude == null && parcel.longitude != null ? parcel.longitude : undefined,
      // Keep lotInfo in sync when empty so older screens still see legal text.
      lotInfo: parcel.legalDescription || undefined,
    },
  });

  return { job: updated, snapshot, packageFields: packageFieldsFromParcel(parcel) };
}

export async function getJobParcelCache(organizationId: string, jobId: string) {
  const job = await db.job.findFirst({
    where: { id: jobId, organizationId },
    select: {
      id: true,
      parcelId: true,
      ownerOfRecord: true,
      legalDescription: true,
      parcelConfirmedAt: true,
      parcelSnapshot: true,
      addressLine1: true,
      city: true,
      state: true,
      postalCode: true,
      latitude: true,
      longitude: true,
    },
  });
  if (!job) throw new JobParcelCacheError("Job not found.", "not_found");
  return job;
}

/** Merge confirmed parcel fields into an existing package fieldValues bag. */
export async function applyParcelToPermitPackage(
  organizationId: string,
  packageId: string,
  parcel: DuvalParcelResult,
) {
  const pkg = await db.permitPackage.findFirst({
    where: { id: packageId, organizationId },
    select: { id: true, fieldValues: true, propertyAddress: true },
  });
  if (!pkg) throw new PermitPackageError("Permit package not found.", "not_found");

  const existing =
    pkg.fieldValues && typeof pkg.fieldValues === "object" && !Array.isArray(pkg.fieldValues)
      ? ({ ...(pkg.fieldValues as Record<string, unknown>) } as Record<string, unknown>)
      : {};
  const fromParcel = packageFieldsFromParcel(parcel);
  const next: Record<string, string> = {};
  for (const [k, v] of Object.entries(existing)) {
    if (typeof v === "string" && v.trim()) next[k] = v.trim();
  }
  // Confirmed parcel wins for folio / legal / owner mailing identity.
  Object.assign(next, fromParcel);

  return db.permitPackage.update({
    where: { id: packageId },
    data: {
      fieldValues: next,
      propertyAddress: parcel.siteAddress || pkg.propertyAddress,
    },
  });
}

export function assertParcelResult(value: unknown): DuvalParcelResult {
  if (!value || typeof value !== "object") {
    throw new DuvalParcelLookupError("Parcel payload required.", "validation");
  }
  const v = value as Record<string, unknown>;
  const parcelId = typeof v.parcelId === "string" ? v.parcelId.trim() : "";
  if (!parcelId) {
    throw new DuvalParcelLookupError("parcelId (RE#) is required.", "validation");
  }
  return {
    parcelId,
    parcelIdDigits:
      typeof v.parcelIdDigits === "string" ? v.parcelIdDigits : parcelId.replace(/\D/g, ""),
    taxFolioDisplay:
      typeof v.taxFolioDisplay === "string" && v.taxFolioDisplay.trim()
        ? v.taxFolioDisplay.trim()
        : parcelId,
    ownerOfRecord: typeof v.ownerOfRecord === "string" ? v.ownerOfRecord : "",
    owners: Array.isArray(v.owners)
      ? v.owners
          .filter((o): o is { name: string } => !!o && typeof o === "object" && typeof (o as { name?: unknown }).name === "string")
          .map((o) => ({ name: o.name }))
      : [],
    siteAddress: typeof v.siteAddress === "string" ? v.siteAddress : "",
    city: typeof v.city === "string" ? v.city : null,
    postalCode: typeof v.postalCode === "string" ? v.postalCode : null,
    mailingAddressLine1: typeof v.mailingAddressLine1 === "string" ? v.mailingAddressLine1 : null,
    mailingCityStateZip: typeof v.mailingCityStateZip === "string" ? v.mailingCityStateZip : null,
    legalDescription: typeof v.legalDescription === "string" ? v.legalDescription : "",
    latitude: typeof v.latitude === "number" ? v.latitude : null,
    longitude: typeof v.longitude === "number" ? v.longitude : null,
    geometry:
      v.geometry && typeof v.geometry === "object"
        ? (v.geometry as DuvalParcelResult["geometry"])
        : null,
    rawAttributes:
      v.rawAttributes && typeof v.rawAttributes === "object"
        ? (v.rawAttributes as Record<string, unknown>)
        : {},
  };
}
