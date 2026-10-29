/**
 * Permitting checklist per job: staff-selected trade permits, per-permit
 * inspections, NOC/NTBO. Multiple MEP permits per job (different subs) are the
 * normal case — each JobPermit is one trade with its own vendor + inspections.
 */

import { PermitTrade } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { EmailNotConfiguredError, sendEmail } from "@/lib/email/send";
import { isTransactionalEmailConfigured } from "@/lib/env";
import { tradeLabel } from "@/lib/permitting/labels";

export { tradeLabel } from "@/lib/permitting/labels";

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

export class PermitAlreadyExistsError extends Error {
  constructor(trade: string) {
    super(`A ${trade} permit is already on this job.`);
    this.name = "PermitAlreadyExistsError";
  }
}

/** Trades staff can add on a job (Building always relevant; MEP/Roofing as needed). */
export const STAFF_PERMIT_TRADES: readonly PermitTrade[] = [
  PermitTrade.BUILDING,
  PermitTrade.ELECTRICAL,
  PermitTrade.PLUMBING,
  PermitTrade.MECHANICAL,
  PermitTrade.ROOFING,
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
 * Electrical defaults: Rough + Cover-Up + Final (cover before conceal; final at end).
 */
export const DEFAULT_INSPECTIONS_ON_ADD: Readonly<Record<PermitTrade, readonly string[]>> = {
  BUILDING: ["Footer", "Slab", "Framing", "Building Final"],
  ELECTRICAL: ["Electrical Rough", "Electrical Cover-Up", "Electrical Final"],
  PLUMBING: ["Plumbing Underground", "Plumbing Rough", "Plumbing Final"],
  MECHANICAL: ["Mechanical Rough", "Mechanical Final"],
  ROOFING: ["Roof Sheathing", "Roof Final"],
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
};

/** Header chip: docs pack marked created on the job. */
export function hasBuildingPermitDocs(docsCreatedAt: Date | null | undefined): boolean {
  return docsCreatedAt != null;
}

/**
 * Header chip: Active permit when the Building permit is pulled (city issued).
 * MEP/Roofing pull status stays on each card — they are not the "active permit" signal.
 */
export function hasActiveBuildingPermit(permits: readonly JobPermitSummary[]): boolean {
  const building = permits.find((p) => p.trade === PermitTrade.BUILDING);
  return building?.pulled === true;
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
      permitNumber: true,
      nocOnFile: true,
      ntboFiled: true,
      buildingPermitDocsCreatedAt: true,
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

  const existing = await db.jobPermit.findUnique({
    where: { jobId_trade: { jobId, trade: PermitTrade.BUILDING } },
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
    const existing = await db.jobPermit.findUnique({ where: { jobId_trade: { jobId, trade } } });
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
    /** When true (default), seed DEFAULT_INSPECTIONS_ON_ADD for the trade. */
    readonly seedDefaultInspections?: boolean;
  },
) {
  const job = await db.job.findFirst({
    where: { id: jobId, organizationId },
    select: { id: true, permitNumber: true },
  });
  if (!job) throw new JobNotFoundError(jobId);

  const existing = await db.jobPermit.findUnique({ where: { jobId_trade: { jobId, trade } } });
  if (existing) throw new PermitAlreadyExistsError(tradeLabel(trade));

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

  return db.jobPermit.create({
    data: {
      organizationId,
      jobId,
      trade,
      permitNumber,
      vendorId: options?.vendorId ?? null,
      inspections: {
        create: defaults.map((name, index) => ({ name, sortOrder: index })),
      },
    },
    include: permitInclude,
  });
}

export async function deleteJobPermit(organizationId: string, permitId: string) {
  const permit = await db.jobPermit.findFirst({
    where: { id: permitId, organizationId },
    select: { id: true },
  });
  if (!permit) throw new PermitNotFoundError(permitId);
  await db.jobPermit.delete({ where: { id: permit.id } });
}

export async function addPermitInspection(organizationId: string, permitId: string, name: string) {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Inspection name is required.");

  const permit = await db.jobPermit.findFirst({
    where: { id: permitId, organizationId },
    include: { inspections: { select: { name: true, sortOrder: true }, orderBy: { sortOrder: "desc" }, take: 1 } },
  });
  if (!permit) throw new PermitNotFoundError(permitId);

  const duplicate = await db.jobPermitInspection.findFirst({
    where: { permitId, name: { equals: trimmed, mode: "insensitive" } },
    select: { id: true },
  });
  if (duplicate) throw new Error(`Inspection "${trimmed}" is already on this permit.`);

  const nextOrder = (permit.inspections[0]?.sortOrder ?? -1) + 1;
  return db.jobPermitInspection.create({
    data: { permitId, name: trimmed, sortOrder: nextOrder },
  });
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

/** Trades not yet on the job that staff can still add. */
export function availableTradesToAdd(existingTrades: readonly PermitTrade[]): readonly PermitTrade[] {
  const have = new Set(existingTrades);
  return STAFF_PERMIT_TRADES.filter((trade) => !have.has(trade));
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
    data: { pulled, pulledAt: pulled ? new Date() : null },
  });
}

export async function setJobNocNtbo(
  organizationId: string,
  jobId: string,
  data: {
    nocOnFile?: boolean;
    ntboFiled?: boolean;
    buildingPermitDocsCreated?: boolean;
  },
) {
  const job = await db.job.findFirst({ where: { id: jobId, organizationId }, select: { id: true } });
  if (!job) throw new JobNotFoundError(jobId);
  return db.job.update({
    where: { id: job.id },
    data: {
      ...(data.nocOnFile !== undefined ? { nocOnFile: data.nocOnFile } : {}),
      ...(data.ntboFiled !== undefined ? { ntboFiled: data.ntboFiled } : {}),
      ...(data.buildingPermitDocsCreated !== undefined
        ? { buildingPermitDocsCreatedAt: data.buildingPermitDocsCreated ? new Date() : null }
        : {}),
    },
  });
}

export async function setInspectionCompleted(organizationId: string, inspectionId: string, completed: boolean) {
  const inspection = await db.jobPermitInspection.findFirst({
    where: { id: inspectionId, permit: { organizationId } },
  });
  if (!inspection) throw new InspectionNotFoundError(inspectionId);
  return db.jobPermitInspection.update({
    where: { id: inspection.id },
    data: { completedAt: completed ? new Date() : null },
  });
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
