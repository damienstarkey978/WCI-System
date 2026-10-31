/**
 * Permitting checklist per job: staff-selected trade permits, per-permit
 * inspections, NOC/NTBO. Multiple permits per trade (second building, temp-pole,
 * site, etc.) are allowed — each JobPermit has its own vendor + inspections.
 */

import {
  InspectionResult,
  PermitRockstarSetupType,
  PermitStatus,
  PermitTrade,
} from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { EmailNotConfiguredError, sendEmail } from "@/lib/email/send";
import { isTransactionalEmailConfigured } from "@/lib/env";
import { assertCents } from "@/lib/money";
import { tradeLabel } from "@/lib/permitting/labels";

export { permitStatusLabel, tradeLabel } from "@/lib/permitting/labels";

/** Job-level Permit Rockstar ledger (one per job — Duval/Jax private provider). */
export type PermitRockstarLedger = {
  readonly privateProvider: boolean;
  readonly setupType: PermitRockstarSetupType | null;
  readonly invoiced: boolean;
  readonly paid: boolean;
  /** Integer cents; null when unset. */
  readonly feePerInspectionCents: number | null;
  readonly invoiceNumber: string | null;
  /** Invoice total, integer cents; null when unset. */
  readonly invoiceAmountCents: number | null;
  readonly invoicedAt: Date | null;
  readonly paidAt: Date | null;
};

export function permitRockstarLedgerFromJob(job: {
  readonly permitRockstarPrivateProvider: boolean;
  readonly permitRockstarSetupType: PermitRockstarSetupType | null;
  readonly permitRockstarInvoiced: boolean;
  readonly permitRockstarPaid: boolean;
  readonly permitRockstarFeePerInspectionCents: number | null;
  readonly permitRockstarInvoiceNumber?: string | null;
  readonly permitRockstarInvoiceAmountCents?: number | null;
  readonly permitRockstarInvoicedAt?: Date | null;
  readonly permitRockstarPaidAt?: Date | null;
}): PermitRockstarLedger {
  return {
    privateProvider: job.permitRockstarPrivateProvider,
    setupType: job.permitRockstarSetupType,
    invoiced: job.permitRockstarInvoiced,
    paid: job.permitRockstarPaid,
    feePerInspectionCents: job.permitRockstarFeePerInspectionCents,
    invoiceNumber: job.permitRockstarInvoiceNumber ?? null,
    invoiceAmountCents: job.permitRockstarInvoiceAmountCents ?? null,
    invoicedAt: job.permitRockstarInvoicedAt ?? null,
    paidAt: job.permitRockstarPaidAt ?? null,
  };
}

export class JobNotFoundError extends Error {
  constructor(jobId: string) {
    super(`Job ${jobId} not found`);
    this.name = "JobNotFoundError";
  }
}

export class PermitNotFoundError extends Error {
  constructor(permitId: string) {
    super(`Permit ${permitId} not found`);
    this.name = "PermitNotFoundError";
  }
}

export class InspectionNotFoundError extends Error {
  constructor(inspectionId: string) {
    super(`Inspection ${inspectionId} not found`);
    this.name = "InspectionNotFoundError";
  }
}

export class NoVendorEmailError extends Error {
  constructor(trade: string) {
    super(`No sub email on file for ${trade} — assign a vendor with an email first.`);
    this.name = "NoVendorEmailError";
  }
}

/** @deprecated Unique-per-trade was removed — kept so older call sites compile until cleaned up. */
export class PermitAlreadyExistsError extends Error {
  constructor(trade: string) {
    super(`A ${trade} permit is already on this job.`);
    this.name = "PermitAlreadyExistsError";
  }
}

/** Trades staff can add on a job (duplicates of the same trade are allowed). */
export const STAFF_PERMIT_TRADES: readonly PermitTrade[] = [
  PermitTrade.BUILDING,
  PermitTrade.TEMP_POLE,
  PermitTrade.SITE,
  PermitTrade.ELECTRICAL,
  PermitTrade.PLUMBING,
  PermitTrade.MECHANICAL,
  PermitTrade.ROOFING,
  PermitTrade.OTHER,
];

/** @deprecated Prefer STAFF_PERMIT_TRADES — kept for ensureDefaultPermits (Building + MEP shells). */
export const DEFAULT_PERMIT_TRADES: readonly PermitTrade[] = [
  PermitTrade.BUILDING,
  PermitTrade.ELECTRICAL,
  PermitTrade.PLUMBING,
  PermitTrade.MECHANICAL,
];

/**
 * Typical inspections seeded when staff/API adds a permit (editable afterward).
 * Roofing: only Roof Final by default — Roof Sheathing is opt-in (Damien: do not
 * auto-create undeletable sheathing without consent).
 */
export const DEFAULT_INSPECTIONS_ON_ADD: Readonly<Record<PermitTrade, readonly string[]>> = {
  BUILDING: ["Footer", "Slab", "Framing", "Building Final"],
  TEMP_POLE: [],
  SITE: [],
  ELECTRICAL: ["Electrical Rough", "Electrical Cover-Up", "Electrical Final"],
  PLUMBING: ["Plumbing Underground", "Plumbing Rough", "Plumbing Final"],
  MECHANICAL: ["Mechanical Rough", "Mechanical Final"],
  ROOFING: ["Roof Final"],
  OTHER: [],
};

/** Full catalog staff can add beyond the defaults (demo placeholders until city software). */
export const DEMO_INSPECTIONS_BY_TRADE: Readonly<Record<PermitTrade, readonly string[]>> = {
  BUILDING: [
    "Footer",
    "Slab",
    "Framing",
    "Wall Sheathing",
    "Roof Sheathing",
    "Dry-In",
    "Insulation",
    "Building Final",
  ],
  TEMP_POLE: ["Temp Pole"],
  SITE: ["Site"],
  ELECTRICAL: [
    "Electrical Underground",
    "Electrical Rough",
    "Electrical Cover-Up",
    "Electrical Final",
  ],
  PLUMBING: ["Plumbing Underground", "Plumbing Rough", "Plumbing Final"],
  MECHANICAL: ["Mechanical Rough", "Mechanical Final"],
  ROOFING: ["Roof Sheathing", "Roof Final"],
  OTHER: [],
};

const permitInclude = {
  vendor: { select: { id: true, name: true, email: true } },
  inspections: { orderBy: { sortOrder: "asc" as const } },
} as const;

export type JobPermitSummary = {
  readonly trade: PermitTrade;
  readonly pulled: boolean;
  readonly permitNumber: string | null;
  readonly status?: PermitStatus;
};

/** Header chip: docs pack marked created on the job. */
export function hasBuildingPermitDocs(docsCreatedAt: Date | null | undefined): boolean {
  return docsCreatedAt != null;
}

function permitIsActive(permit: JobPermitSummary): boolean {
  if (permit.status === PermitStatus.ACTIVE) return true;
  if (
    permit.status === PermitStatus.EXPIRED ||
    permit.status === PermitStatus.CANCELLED ||
    permit.status === PermitStatus.FINALIZED ||
    permit.status === PermitStatus.RETURNED_FOR_CORRECTIONS ||
    permit.status === PermitStatus.DRAFT ||
    permit.status === PermitStatus.PENDING_PAYMENT
  ) {
    return false;
  }
  // Legacy rows without status: fall back to pulled.
  return permit.pulled === true;
}

/**
 * Header chip: Active permit when any Building permit is ACTIVE / pulled.
 * MEP/Roofing stay on each card — they are not the header "active permit" signal.
 */
export function hasActiveBuildingPermit(permits: readonly JobPermitSummary[]): boolean {
  return permits.some((p) => p.trade === PermitTrade.BUILDING && permitIsActive(p));
}

/**
 * Load one job's permitting state. Never seeds permits — staff/API add them
 * (staff UI may call ensureBuildingPermit separately).
 */
export async function getJobPermitting(organizationId: string, jobId: string) {
  const job = await db.job.findFirst({
    where: { id: jobId, organizationId, isTemplate: false },
    select: {
      id: true,
      name: true,
      status: true,
      addressLine1: true,
      city: true,
      state: true,
      postalCode: true,
      permitNumber: true,
      nocOnFile: true,
      nocNumber: true,
      nocFiledOn: true,
      ntboFiled: true,
      ntboNumber: true,
      ntboFiledOn: true,
      buildingPermitDocsCreatedAt: true,
      permitRockstarPrivateProvider: true,
      permitRockstarSetupType: true,
      permitRockstarInvoiced: true,
      permitRockstarPaid: true,
      permitRockstarFeePerInspectionCents: true,
      permitRockstarInvoiceNumber: true,
      permitRockstarInvoiceAmountCents: true,
      permitRockstarInvoicedAt: true,
      permitRockstarPaidAt: true,
      permits: {
        orderBy: { trade: "asc" },
        include: permitInclude,
      },
    },
  });
  if (!job) throw new JobNotFoundError(jobId);
  return job;
}

/**
 * Staff UI default: ensure a Building permit shell exists (no MEP/Roofing).
 * Does not invent inspections — staff add those, or createJobPermit seeds them
 * when adding a trade explicitly.
 */
export async function ensureBuildingPermit(organizationId: string, jobId: string) {
  const job = await db.job.findFirst({ where: { id: jobId, organizationId }, select: { id: true, permitNumber: true } });
  if (!job) throw new JobNotFoundError(jobId);

  const existing = await db.jobPermit.findFirst({
    where: { jobId, trade: PermitTrade.BUILDING },
    orderBy: { createdAt: "asc" },
  });
  if (existing) return existing;

  return db.jobPermit.create({
    data: {
      organizationId,
      jobId,
      trade: PermitTrade.BUILDING,
      permitNumber: job.permitNumber,
    },
  });
}

/**
 * Explicit write: create Building + MEP shells when missing (no inspections).
 * Staff UI does **not** call this (would phantom-list Electrical/Plumbing/Mechanical).
 * Bots that want a quick MEP scaffold still can via POST .../permits/ensure-defaults.
 * Prefer createJobPermit for one trade.
 */
export async function ensureDefaultPermits(organizationId: string, jobId: string) {
  const job = await db.job.findFirst({ where: { id: jobId, organizationId }, select: { id: true, permitNumber: true } });
  if (!job) throw new JobNotFoundError(jobId);

  for (const trade of DEFAULT_PERMIT_TRADES) {
    const existing = await db.jobPermit.findFirst({ where: { jobId, trade }, select: { id: true } });
    if (existing) continue;

    await db.jobPermit.create({
      data: {
        organizationId,
        jobId,
        trade,
        permitNumber: trade === PermitTrade.BUILDING ? job.permitNumber : null,
      },
    });
  }
}

export async function setBuildingPermitDocsCreated(
  organizationId: string,
  jobId: string,
  created: boolean,
) {
  const job = await db.job.findFirst({ where: { id: jobId, organizationId }, select: { id: true } });
  if (!job) throw new JobNotFoundError(jobId);
  return db.job.update({
    where: { id: job.id },
    data: { buildingPermitDocsCreatedAt: created ? new Date() : null },
  });
}

export async function createJobPermit(
  organizationId: string,
  jobId: string,
  trade: PermitTrade,
  options?: {
    readonly permitNumber?: string | null;
    readonly vendorId?: string | null;
    readonly label?: string | null;
    readonly status?: PermitStatus;
    readonly issuedAt?: Date | null;
    readonly expiresAt?: Date | null;
    readonly jurisdiction?: string | null;
    readonly contractorName?: string | null;
    /** When true (default), seed DEFAULT_INSPECTIONS_ON_ADD for the trade. */
    readonly seedDefaultInspections?: boolean;
  },
) {
  const job = await db.job.findFirst({
    where: { id: jobId, organizationId },
    select: { id: true, permitNumber: true },
  });
  if (!job) throw new JobNotFoundError(jobId);

  if (options?.vendorId) {
    const vendor = await db.vendor.findFirst({
      where: { id: options.vendorId, organizationId },
      select: { id: true },
    });
    if (!vendor) throw new Error("Vendor not found.");
  }

  const seed = options?.seedDefaultInspections !== false;
  const defaults = seed ? DEFAULT_INSPECTIONS_ON_ADD[trade] : [];
  const permitNumber =
    options?.permitNumber !== undefined
      ? options.permitNumber
      : trade === PermitTrade.BUILDING
        ? job.permitNumber
        : null;

  const status = options?.status ?? PermitStatus.DRAFT;
  const pulled = status === PermitStatus.ACTIVE;

  const created = await db.jobPermit.create({
    data: {
      organizationId,
      jobId,
      trade,
      label: options?.label?.trim() || null,
      permitNumber,
      status,
      pulled,
      pulledAt: pulled ? new Date() : null,
      issuedAt: options?.issuedAt ?? null,
      expiresAt: options?.expiresAt ?? null,
      jurisdiction: options?.jurisdiction?.trim() || null,
      contractorName: options?.contractorName?.trim() || null,
      vendorId: options?.vendorId ?? null,
      inspections: {
        create: defaults.map((name, index) => ({ name, sortOrder: index })),
      },
    },
    include: permitInclude,
  });

  const syncedNumber = typeof permitNumber === "string" ? permitNumber.trim() : "";
  if (trade === PermitTrade.BUILDING && syncedNumber && !job.permitNumber?.trim()) {
    await db.job.update({ where: { id: jobId }, data: { permitNumber: syncedNumber } });
  }

  return created;
}

export async function deleteJobPermit(organizationId: string, permitId: string) {
  const permit = await db.jobPermit.findFirst({
    where: { id: permitId, organizationId },
    select: { id: true },
  });
  if (!permit) throw new PermitNotFoundError(permitId);
  await db.jobPermit.delete({ where: { id: permit.id } });
}

export type AddPermitInspectionResult = {
  readonly inspection: Awaited<ReturnType<typeof db.jobPermitInspection.create>>;
  /** False when an existing same-name inspection was returned (idempotent). */
  readonly created: boolean;
};

/**
 * Add an inspection by name. Idempotent: if the name already exists on this
 * permit (case-insensitive), returns the existing row instead of conflicting.
 */
export async function addPermitInspection(
  organizationId: string,
  permitId: string,
  name: string,
): Promise<AddPermitInspectionResult> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Inspection name is required.");

  const permit = await db.jobPermit.findFirst({
    where: { id: permitId, organizationId },
    include: { inspections: { select: { name: true, sortOrder: true }, orderBy: { sortOrder: "desc" }, take: 1 } },
  });
  if (!permit) throw new PermitNotFoundError(permitId);

  const existing = await db.jobPermitInspection.findFirst({
    where: { permitId, name: { equals: trimmed, mode: "insensitive" } },
  });
  if (existing) return { inspection: existing, created: false };

  const nextOrder = (permit.inspections[0]?.sortOrder ?? -1) + 1;
  const inspection = await db.jobPermitInspection.create({
    data: { permitId, name: trimmed, sortOrder: nextOrder },
  });
  return { inspection, created: true };
}

export async function removePermitInspection(organizationId: string, inspectionId: string) {
  const inspection = await db.jobPermitInspection.findFirst({
    where: { id: inspectionId, permit: { organizationId } },
    select: { id: true },
  });
  if (!inspection) throw new InspectionNotFoundError(inspectionId);
  await db.jobPermitInspection.delete({ where: { id: inspection.id } });
}

/** Catalog names staff can add for a trade (demo placeholders until city software wires in). */
export function catalogInspectionNamesForTrade(trade: PermitTrade): readonly string[] {
  return DEMO_INSPECTIONS_BY_TRADE[trade] ?? [];
}

/**
 * Trades staff can still add. Duplicates per trade are allowed (second building,
 * temp-pole, site), so the full staff catalog is always offered.
 */
export function availableTradesToAdd(existingTrades?: readonly PermitTrade[]): readonly PermitTrade[] {
  void existingTrades;
  return STAFF_PERMIT_TRADES;
}

/**
 * @deprecated Org-wide multi-job list — do not use for the job Permitting page.
 * Prefer getJobPermitting(organizationId, jobId).
 */
export async function listPermittingJobs(organizationId: string) {
  return db.job.findMany({
    where: { organizationId, isTemplate: false, status: { in: ["PRE_SALE", "OPEN", "WARRANTY"] } },
    orderBy: [{ status: "asc" }, { name: "asc" }],
    include: {
      permits: {
        orderBy: { trade: "asc" },
        include: permitInclude,
      },
    },
  });
}

export async function setPermitPulled(organizationId: string, permitId: string, pulled: boolean) {
  const permit = await db.jobPermit.findFirst({ where: { id: permitId, organizationId } });
  if (!permit) throw new PermitNotFoundError(permitId);
  return db.jobPermit.update({
    where: { id: permit.id },
    data: {
      pulled,
      pulledAt: pulled ? new Date() : null,
      // Keep status chips in sync with the legacy pulled toggle.
      status: pulled ? PermitStatus.ACTIVE : PermitStatus.DRAFT,
    },
  });
}

export interface UpdatePermitFieldsInput {
  readonly pulled?: boolean;
  readonly vendorId?: string | null;
  readonly permitNumber?: string | null;
  readonly label?: string | null;
  /** Reclassify trade (e.g. OTHER → BUILDING when a second building permit was mis-filed). */
  readonly trade?: PermitTrade;
  readonly status?: PermitStatus;
  readonly issuedAt?: Date | null;
  readonly expiresAt?: Date | null;
  readonly jurisdiction?: string | null;
  readonly contractorName?: string | null;
}

export async function updatePermitFields(
  organizationId: string,
  permitId: string,
  input: UpdatePermitFieldsInput,
) {
  const permit = await db.jobPermit.findFirst({ where: { id: permitId, organizationId } });
  if (!permit) throw new PermitNotFoundError(permitId);

  if (input.vendorId) {
    const vendor = await db.vendor.findFirst({
      where: { id: input.vendorId, organizationId },
      select: { id: true },
    });
    if (!vendor) throw new Error("Vendor not found.");
  }

  let status = input.status;
  let pulled = input.pulled;
  if (status !== undefined && pulled === undefined) {
    pulled = status === PermitStatus.ACTIVE;
  }
  if (pulled !== undefined && status === undefined) {
    status = pulled ? PermitStatus.ACTIVE : PermitStatus.DRAFT;
  }

  const nextPermitNumber =
    input.permitNumber !== undefined ? input.permitNumber?.trim() || null : undefined;
  const nextTrade = input.trade;

  const updated = await db.jobPermit.update({
    where: { id: permit.id },
    data: {
      ...(nextPermitNumber !== undefined ? { permitNumber: nextPermitNumber } : {}),
      ...(input.label !== undefined ? { label: input.label?.trim() || null } : {}),
      ...(nextTrade !== undefined ? { trade: nextTrade } : {}),
      ...(input.vendorId !== undefined ? { vendorId: input.vendorId } : {}),
      ...(input.jurisdiction !== undefined ? { jurisdiction: input.jurisdiction?.trim() || null } : {}),
      ...(input.contractorName !== undefined
        ? { contractorName: input.contractorName?.trim() || null }
        : {}),
      ...(input.issuedAt !== undefined ? { issuedAt: input.issuedAt } : {}),
      ...(input.expiresAt !== undefined ? { expiresAt: input.expiresAt } : {}),
      ...(status !== undefined ? { status } : {}),
      ...(pulled !== undefined
        ? { pulled, pulledAt: pulled ? (permit.pulledAt ?? new Date()) : null }
        : {}),
    },
    include: permitInclude,
  });

  // Keep Job.permitNumber in sync with a Building permit number (Heather #11 / New #7).
  const effectiveTrade = nextTrade ?? permit.trade;
  if (effectiveTrade === PermitTrade.BUILDING && nextPermitNumber !== undefined && nextPermitNumber) {
    await db.job.update({
      where: { id: permit.jobId },
      data: { permitNumber: nextPermitNumber },
    });
  }

  return updated;
}

export async function setJobNocNtbo(
  organizationId: string,
  jobId: string,
  data: {
    nocOnFile?: boolean;
    ntboFiled?: boolean;
    nocNumber?: string | null;
    ntboNumber?: string | null;
    nocFiledOn?: Date | null;
    ntboFiledOn?: Date | null;
    buildingPermitDocsCreated?: boolean;
  },
) {
  const job = await db.job.findFirst({ where: { id: jobId, organizationId }, select: { id: true } });
  if (!job) throw new JobNotFoundError(jobId);

  const nocNumber =
    data.nocNumber !== undefined ? data.nocNumber?.trim() || null : undefined;
  const ntboNumber =
    data.ntboNumber !== undefined ? data.ntboNumber?.trim() || null : undefined;

  // Setting a number or filed-on date implies the boolean chip is true unless explicitly cleared.
  let nocOnFile = data.nocOnFile;
  if (nocOnFile === undefined) {
    if (nocNumber) nocOnFile = true;
    else if (data.nocFiledOn) nocOnFile = true;
  }
  let ntboFiled = data.ntboFiled;
  if (ntboFiled === undefined) {
    if (ntboNumber) ntboFiled = true;
    else if (data.ntboFiledOn) ntboFiled = true;
  }

  return db.job.update({
    where: { id: job.id },
    data: {
      ...(nocOnFile !== undefined ? { nocOnFile } : {}),
      ...(ntboFiled !== undefined ? { ntboFiled } : {}),
      ...(nocNumber !== undefined ? { nocNumber } : {}),
      ...(ntboNumber !== undefined ? { ntboNumber } : {}),
      ...(data.nocFiledOn !== undefined ? { nocFiledOn: data.nocFiledOn } : {}),
      ...(data.ntboFiledOn !== undefined ? { ntboFiledOn: data.ntboFiledOn } : {}),
      ...(data.buildingPermitDocsCreated !== undefined
        ? { buildingPermitDocsCreatedAt: data.buildingPermitDocsCreated ? new Date() : null }
        : {}),
    },
  });
}

export interface UpdatePermitRockstarLedgerInput {
  readonly privateProvider?: boolean;
  readonly setupType?: PermitRockstarSetupType | null;
  readonly invoiced?: boolean;
  readonly paid?: boolean;
  /** Integer cents; null clears. */
  readonly feePerInspectionCents?: number | null;
  readonly invoiceNumber?: string | null;
  /** Invoice total, integer cents; null clears. */
  readonly invoiceAmountCents?: number | null;
  readonly invoicedAt?: Date | null;
  readonly paidAt?: Date | null;
}

/**
 * Update the job's single Permit Rockstar ledger. Does not touch JobPermit rows.
 */
export async function updatePermitRockstarLedger(
  organizationId: string,
  jobId: string,
  input: UpdatePermitRockstarLedgerInput,
) {
  const job = await db.job.findFirst({ where: { id: jobId, organizationId }, select: { id: true } });
  if (!job) throw new JobNotFoundError(jobId);

  if (input.feePerInspectionCents !== undefined && input.feePerInspectionCents !== null) {
    assertCents(input.feePerInspectionCents, "feePerInspectionCents");
    if (input.feePerInspectionCents < 0) {
      throw new Error("feePerInspectionCents must be >= 0.");
    }
  }
  if (input.invoiceAmountCents !== undefined && input.invoiceAmountCents !== null) {
    assertCents(input.invoiceAmountCents, "invoiceAmountCents");
    if (input.invoiceAmountCents < 0) {
      throw new Error("invoiceAmountCents must be >= 0.");
    }
  }

  let invoiced = input.invoiced;
  if (invoiced === undefined) {
    if (input.invoiceNumber?.trim() || input.invoicedAt || input.invoiceAmountCents) {
      invoiced = true;
    }
  }
  let paid = input.paid;
  if (paid === undefined && input.paidAt) {
    paid = true;
  }

  const updated = await db.job.update({
    where: { id: job.id },
    data: {
      ...(input.privateProvider !== undefined
        ? { permitRockstarPrivateProvider: input.privateProvider }
        : {}),
      ...(input.setupType !== undefined ? { permitRockstarSetupType: input.setupType } : {}),
      ...(invoiced !== undefined ? { permitRockstarInvoiced: invoiced } : {}),
      ...(paid !== undefined ? { permitRockstarPaid: paid } : {}),
      ...(input.feePerInspectionCents !== undefined
        ? { permitRockstarFeePerInspectionCents: input.feePerInspectionCents }
        : {}),
      ...(input.invoiceNumber !== undefined
        ? { permitRockstarInvoiceNumber: input.invoiceNumber?.trim() || null }
        : {}),
      ...(input.invoiceAmountCents !== undefined
        ? { permitRockstarInvoiceAmountCents: input.invoiceAmountCents }
        : {}),
      ...(input.invoicedAt !== undefined ? { permitRockstarInvoicedAt: input.invoicedAt } : {}),
      ...(input.paidAt !== undefined ? { permitRockstarPaidAt: input.paidAt } : {}),
    },
    select: {
      id: true,
      permitRockstarPrivateProvider: true,
      permitRockstarSetupType: true,
      permitRockstarInvoiced: true,
      permitRockstarPaid: true,
      permitRockstarFeePerInspectionCents: true,
      permitRockstarInvoiceNumber: true,
      permitRockstarInvoiceAmountCents: true,
      permitRockstarInvoicedAt: true,
      permitRockstarPaidAt: true,
    },
  });

  return {
    id: updated.id,
    permitRockstar: permitRockstarLedgerFromJob(updated),
  };
}

export async function setInspectionCompleted(organizationId: string, inspectionId: string, completed: boolean) {
  const inspection = await db.jobPermitInspection.findFirst({
    where: { id: inspectionId, permit: { organizationId } },
  });
  if (!inspection) throw new InspectionNotFoundError(inspectionId);
  return db.jobPermitInspection.update({
    where: { id: inspection.id },
    data: completed
      ? {
          completedAt: new Date(),
          result: inspection.result === InspectionResult.PENDING ? InspectionResult.PASS : inspection.result,
          // Do not invent a city pass date — staff set passedAt explicitly.
        }
      : {
          completedAt: null,
          result: InspectionResult.PENDING,
        },
  });
}

export interface UpdateInspectionFieldsInput {
  readonly completed?: boolean;
  readonly result?: InspectionResult;
  /** Real city pass/completed date — distinct from completedAt (system stamp). */
  readonly passedAt?: Date | null;
  readonly confirmationNumber?: string | null;
  readonly inspector?: string | null;
  /** Rename the inspection. */
  readonly name?: string;
  /** Move to another JobPermit on the same job (cross-trade). */
  readonly permitId?: string;
}

export async function updateInspectionFields(
  organizationId: string,
  inspectionId: string,
  input: UpdateInspectionFieldsInput,
) {
  const inspection = await db.jobPermitInspection.findFirst({
    where: { id: inspectionId, permit: { organizationId } },
    include: {
      permit: { select: { id: true, jobId: true, trade: true, organizationId: true } },
      folder: { select: { id: true, name: true } },
    },
  });
  if (!inspection) throw new InspectionNotFoundError(inspectionId);

  const data: {
    completedAt?: Date | null;
    result?: InspectionResult;
    passedAt?: Date | null;
    confirmationNumber?: string | null;
    inspector?: string | null;
    name?: string;
    permitId?: string;
  } = {};

  if (input.result !== undefined) data.result = input.result;
  if (input.passedAt !== undefined) data.passedAt = input.passedAt;
  if (input.confirmationNumber !== undefined) {
    data.confirmationNumber = input.confirmationNumber?.trim() || null;
  }
  if (input.inspector !== undefined) data.inspector = input.inspector?.trim() || null;

  let nextName = inspection.name;
  if (input.name !== undefined) {
    const trimmed = input.name.trim();
    if (!trimmed) throw new Error("Inspection name is required.");
    data.name = trimmed;
    nextName = trimmed;
  }

  let nextTrade = inspection.permit.trade;
  if (input.permitId !== undefined && input.permitId !== inspection.permitId) {
    const target = await db.jobPermit.findFirst({
      where: {
        id: input.permitId,
        organizationId,
        jobId: inspection.permit.jobId,
      },
      select: { id: true, trade: true },
    });
    if (!target) {
      throw new PermitNotFoundError(input.permitId);
    }
    const nameClash = await db.jobPermitInspection.findFirst({
      where: {
        permitId: target.id,
        name: { equals: nextName, mode: "insensitive" },
        id: { not: inspection.id },
      },
      select: { id: true },
    });
    if (nameClash) {
      throw new Error(
        `An inspection named "${nextName}" already exists on the target permit.`,
      );
    }
    data.permitId = target.id;
    nextTrade = target.trade;
  }

  if (input.completed === true) {
    data.completedAt = inspection.completedAt ?? new Date();
    if (data.result === undefined && inspection.result === InspectionResult.PENDING) {
      data.result = InspectionResult.PASS;
    }
  } else if (input.completed === false) {
    data.completedAt = null;
    if (data.result === undefined) data.result = InspectionResult.PENDING;
  } else if (
    input.result === InspectionResult.PASS ||
    input.result === InspectionResult.FAIL ||
    input.result === InspectionResult.PARTIAL
  ) {
    data.completedAt = inspection.completedAt ?? new Date();
  } else if (input.result === InspectionResult.PENDING) {
    data.completedAt = null;
  }

  const updated = await db.jobPermitInspection.update({
    where: { id: inspection.id },
    data,
    include: {
      permit: { select: { id: true, trade: true, jobId: true } },
      folder: { select: { id: true, name: true } },
    },
  });

  // Keep the picture folder name aligned when renaming/moving (best-effort).
  if (updated.folder && (input.name !== undefined || input.permitId !== undefined)) {
    const { inspectionPictureFolderName, inspectionPictureFolderNameForTrade } = await import(
      "@/lib/permitting/inspection-guides"
    );
    const preferred = inspectionPictureFolderName(nextName);
    const tradeScoped = inspectionPictureFolderNameForTrade(nextName, nextTrade);
    const candidates = [preferred, tradeScoped];
    for (const candidate of candidates) {
      if (candidate.toLowerCase() === updated.folder.name.toLowerCase()) break;
      const taken = await db.fileFolder.findFirst({
        where: {
          jobId: updated.permit.jobId,
          organizationId,
          name: { equals: candidate, mode: "insensitive" },
          id: { not: updated.folder.id },
        },
        select: { id: true },
      });
      if (taken) continue;
      await db.fileFolder.update({
        where: { id: updated.folder.id },
        data: { name: candidate },
      });
      break;
    }
  }

  return updated;
}

export async function assignPermitVendor(organizationId: string, permitId: string, vendorId: string | null) {
  const permit = await db.jobPermit.findFirst({ where: { id: permitId, organizationId } });
  if (!permit) throw new PermitNotFoundError(permitId);
  if (vendorId) {
    const vendor = await db.vendor.findFirst({ where: { id: vendorId, organizationId }, select: { id: true } });
    if (!vendor) throw new Error("Vendor not found.");
  }
  return db.jobPermit.update({ where: { id: permit.id }, data: { vendorId } });
}

export function buildPermitReminderEmail(input: {
  vendorName: string;
  contactName: string | null;
  jobName: string;
  trade: string;
  companyName: string;
}) {
  const first = input.contactName?.trim().split(/\s+/)[0] || input.vendorName;
  const text = [
    `Hi ${first},`,
    "",
    `This is a reminder that the ${input.trade} permit for ${input.jobName} still needs to be pulled.`,
    "",
    `Please pull the permit and let us know once it is done.`,
    "",
    `- ${input.companyName}`,
  ].join("\n");
  const escape = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const html =
    `<p>Hi ${escape(first)},</p>` +
    `<p>This is a reminder that the <strong>${escape(input.trade)}</strong> permit for <strong>${escape(input.jobName)}</strong> still needs to be pulled.</p>` +
    `<p>Please pull the permit and let us know once it is done.</p>` +
    `<p>- ${escape(input.companyName)}</p>`;
  return {
    subject: `${input.companyName}: ${input.trade} permit reminder for ${input.jobName}`,
    text,
    html,
  };
}

export async function sendPermitReminder(organizationId: string, permitId: string) {
  if (!isTransactionalEmailConfigured()) throw new EmailNotConfiguredError();

  const permit = await db.jobPermit.findFirst({
    where: { id: permitId, organizationId },
    include: {
      job: { select: { name: true } },
      vendor: { select: { name: true, email: true, primaryContact: true } },
      organization: { select: { name: true, contactEmail: true } },
    },
  });
  if (!permit) throw new PermitNotFoundError(permitId);
  if (permit.pulled) throw new Error("This permit is already marked pulled.");
  if (!permit.vendor?.email?.trim()) throw new NoVendorEmailError(tradeLabel(permit.trade));

  const message = buildPermitReminderEmail({
    vendorName: permit.vendor.name,
    contactName: permit.vendor.primaryContact,
    jobName: permit.job.name,
    trade: tradeLabel(permit.trade),
    companyName: permit.organization.name,
  });

  await sendEmail({
    to: permit.vendor.email.trim(),
    ...message,
    replyTo: permit.organization.contactEmail ?? undefined,
  });

  return { emailedTo: permit.vendor.email.trim(), trade: tradeLabel(permit.trade) };
}
