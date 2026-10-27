/**
 * Permitting checklist per job: building + MEP permits, inspections, NOC/NTBO.
 * Placeholder inspection names for demo come from the Permit Rockstar catalog
 * (no pools). Production folder/inspection names come from city permitting software.
 */

import { PermitTrade } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { EmailNotConfiguredError, sendEmail } from "@/lib/email/send";
import { isTransactionalEmailConfigured } from "@/lib/env";

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

export const DEFAULT_PERMIT_TRADES: readonly PermitTrade[] = [
  PermitTrade.BUILDING,
  PermitTrade.ELECTRICAL,
  PermitTrade.PLUMBING,
  PermitTrade.MECHANICAL,
];

/** Demo/placeholder city-style inspection names mapped from Permit Rockstar guides (no pools). */
export const DEMO_INSPECTIONS_BY_TRADE: Readonly<Record<PermitTrade, readonly string[]>> = {
  BUILDING: ["Footer", "Slab", "Framing", "Dry-In", "Insulation", "Building Final"],
  ELECTRICAL: ["Electrical Underground", "Electrical Rough", "Electrical Final"],
  PLUMBING: ["Plumbing Underground", "Plumbing Rough", "Plumbing Final"],
  MECHANICAL: ["Mechanical Rough", "Mechanical Final"],
  OTHER: [],
};

export function tradeLabel(trade: PermitTrade): string {
  switch (trade) {
    case PermitTrade.BUILDING:
      return "Building";
    case PermitTrade.ELECTRICAL:
      return "Electrical";
    case PermitTrade.PLUMBING:
      return "Plumbing";
    case PermitTrade.MECHANICAL:
      return "Mechanical";
    case PermitTrade.OTHER:
      return "Other";
  }
}

/**
 * Ensures BUILDING + MEP permit shells exist for a job (idempotent).
 * Does **not** seed the full demo inspection catalog — inspections are added
 * explicitly (city software / staff) so Inspection Pictures only shows folders
 * for inspections required on that job.
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

export async function listPermittingJobs(organizationId: string) {
  const jobs = await db.job.findMany({
    where: { organizationId, isTemplate: false, status: { in: ["PRE_SALE", "OPEN", "WARRANTY"] } },
    orderBy: [{ status: "asc" }, { name: "asc" }],
    include: {
      permits: {
        orderBy: { trade: "asc" },
        include: {
          vendor: { select: { id: true, name: true, email: true } },
          inspections: { orderBy: { sortOrder: "asc" } },
        },
      },
    },
  });

  // Lazily seed default permits for jobs that have none yet.
  for (const job of jobs) {
    if (job.permits.length === 0) {
      await ensureDefaultPermits(organizationId, job.id);
    }
  }

  return db.job.findMany({
    where: { organizationId, isTemplate: false, status: { in: ["PRE_SALE", "OPEN", "WARRANTY"] } },
    orderBy: [{ status: "asc" }, { name: "asc" }],
    include: {
      permits: {
        orderBy: { trade: "asc" },
        include: {
          vendor: { select: { id: true, name: true, email: true } },
          inspections: { orderBy: { sortOrder: "asc" } },
        },
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
  data: { nocOnFile?: boolean; ntboFiled?: boolean },
) {
  const job = await db.job.findFirst({ where: { id: jobId, organizationId }, select: { id: true } });
  if (!job) throw new JobNotFoundError(jobId);
  return db.job.update({
    where: { id: job.id },
    data: {
      ...(data.nocOnFile !== undefined ? { nocOnFile: data.nocOnFile } : {}),
      ...(data.ntboFiled !== undefined ? { ntboFiled: data.ntboFiled } : {}),
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
