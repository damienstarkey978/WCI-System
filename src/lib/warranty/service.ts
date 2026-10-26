/**
 * Warranty (CLAUDE.md 2.3/3, Phase 6): claims with an appointment and "dual
 * acceptance" — the assigned trade confirms the work is done, and separately
 * the client confirms they're satisfied. Both acceptances reuse the existing
 * Client/Vendor Portal token infrastructure (a portal session or a headless
 * one-time link), same pattern as every other external-facing approval —
 * WARRANTY_CLIENT_ACCEPTANCE and WARRANTY_TRADE_ACCEPTANCE are just two more
 * purposes on the same ClientActionToken/VendorActionToken tables, not a
 * fourth auth mechanism.
 */

import { WarrantyClaimStatus } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { emitEvent } from "@/lib/webhooks";

export class JobNotFoundError extends Error {
  constructor(jobId: string) {
    super(`Job ${jobId} not found`);
    this.name = "JobNotFoundError";
  }
}

export class WarrantyClaimNotFoundError extends Error {
  constructor(claimId: string) {
    super(`Warranty claim ${claimId} not found`);
    this.name = "WarrantyClaimNotFoundError";
  }
}

export class VendorNotFoundError extends Error {
  constructor(vendorId: string) {
    super(`Vendor ${vendorId} not found`);
    this.name = "VendorNotFoundError";
  }
}

export class ClientNotFoundError extends Error {
  constructor(clientId: string) {
    super(`Client ${clientId} not found`);
    this.name = "ClientNotFoundError";
  }
}

export class VendorNotAssignedError extends Error {
  constructor(claimId: string) {
    super(`Warranty claim ${claimId} does not have this vendor assigned.`);
    this.name = "VendorNotAssignedError";
  }
}

export class ClientMismatchError extends Error {
  constructor(claimId: string) {
    super(`Warranty claim ${claimId} does not belong to this client.`);
    this.name = "ClientMismatchError";
  }
}

export interface CreateWarrantyClaimInput {
  readonly organizationId: string;
  readonly jobId: string;
  /** When omitted, auto-assigns the next per-org claim number. */
  readonly claimNumber?: string | null;
  readonly title: string;
  readonly description: string;
  readonly submittedByName?: string | null;
  readonly submittedByEmail?: string | null;
  readonly clientId?: string | null;
  readonly category?: string | null;
  readonly priority?: string | null;
  readonly classification?: string | null;
  readonly internalNotes?: string | null;
  readonly addedCostCents?: number;
  readonly showClient?: boolean;
  readonly followUpDate?: Date | null;
}

export async function createWarrantyClaim(input: CreateWarrantyClaimInput) {
  const job = await db.job.findFirst({ where: { id: input.jobId, organizationId: input.organizationId }, select: { id: true } });
  if (!job) throw new JobNotFoundError(input.jobId);

  if (input.clientId) {
    const client = await db.client.findFirst({ where: { id: input.clientId, organizationId: input.organizationId }, select: { id: true } });
    if (!client) throw new ClientNotFoundError(input.clientId);
  }

  let claimNumber = input.claimNumber?.trim() || "";
  if (!claimNumber) {
    const count = await db.warrantyClaim.count({ where: { organizationId: input.organizationId } });
    claimNumber = String(count + 1).padStart(4, "0");
  }

  return db.warrantyClaim.create({
    data: {
      organizationId: input.organizationId,
      jobId: input.jobId,
      claimNumber,
      title: input.title,
      description: input.description,
      submittedByName: input.submittedByName ?? null,
      submittedByEmail: input.submittedByEmail ?? null,
      clientId: input.clientId ?? null,
      category: input.category?.trim() || null,
      priority: input.priority?.trim() || "Low",
      classification: input.classification?.trim() || null,
      internalNotes: input.internalNotes?.trim() || null,
      addedCostCents: input.addedCostCents ?? 0,
      showClient: input.showClient ?? true,
      followUpDate: input.followUpDate ?? null,
    },
  });
}

export interface UpdateWarrantyClaimInput {
  readonly organizationId: string;
  readonly claimId: string;
  readonly title?: string;
  readonly description?: string;
  readonly category?: string | null;
  readonly priority?: string | null;
  readonly classification?: string | null;
  readonly internalNotes?: string | null;
  readonly addedCostCents?: number;
  readonly showClient?: boolean;
  readonly followUpDate?: Date | null;
  readonly clientId?: string | null;
}

export async function updateWarrantyClaim(input: UpdateWarrantyClaimInput) {
  const existing = await db.warrantyClaim.findFirst({
    where: { id: input.claimId, organizationId: input.organizationId },
  });
  if (!existing) throw new WarrantyClaimNotFoundError(input.claimId);

  if (input.clientId) {
    const client = await db.client.findFirst({
      where: { id: input.clientId, organizationId: input.organizationId },
      select: { id: true },
    });
    if (!client) throw new ClientNotFoundError(input.clientId);
  }

  return db.warrantyClaim.update({
    where: { id: existing.id },
    data: {
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.category !== undefined ? { category: input.category?.trim() || null } : {}),
      ...(input.priority !== undefined ? { priority: input.priority?.trim() || "Low" } : {}),
      ...(input.classification !== undefined ? { classification: input.classification?.trim() || null } : {}),
      ...(input.internalNotes !== undefined ? { internalNotes: input.internalNotes?.trim() || null } : {}),
      ...(input.addedCostCents !== undefined ? { addedCostCents: input.addedCostCents } : {}),
      ...(input.showClient !== undefined ? { showClient: input.showClient } : {}),
      ...(input.followUpDate !== undefined ? { followUpDate: input.followUpDate } : {}),
      ...(input.clientId !== undefined ? { clientId: input.clientId } : {}),
    },
  });
}

export interface ScheduleAppointmentInput {
  readonly organizationId: string;
  readonly claimId: string;
  readonly appointmentAt: Date;
  readonly assignedVendorId?: string | null;
}

export async function scheduleAppointment(input: ScheduleAppointmentInput) {
  const claim = await db.warrantyClaim.findFirst({ where: { id: input.claimId, organizationId: input.organizationId } });
  if (!claim) throw new WarrantyClaimNotFoundError(input.claimId);

  if (input.assignedVendorId) {
    const vendor = await db.vendor.findFirst({ where: { id: input.assignedVendorId, organizationId: input.organizationId }, select: { id: true } });
    if (!vendor) throw new VendorNotFoundError(input.assignedVendorId);
  }

  return db.warrantyClaim.update({
    where: { id: claim.id },
    data: {
      appointmentAt: input.appointmentAt,
      assignedVendorId: input.assignedVendorId ?? claim.assignedVendorId,
      status: WarrantyClaimStatus.SCHEDULED,
    },
  });
}

export interface AcceptTradeWorkInput {
  readonly organizationId: string;
  readonly claimId: string;
  readonly vendorId: string;
  readonly signatureName?: string;
}

/** The assigned trade confirms the warranty work is done. */
export async function acceptTradeWork(input: AcceptTradeWorkInput) {
  const claim = await db.warrantyClaim.findFirst({ where: { id: input.claimId, organizationId: input.organizationId } });
  if (!claim) throw new WarrantyClaimNotFoundError(input.claimId);
  if (claim.assignedVendorId !== input.vendorId) throw new VendorNotAssignedError(input.claimId);

  const vendor = await db.vendor.findUniqueOrThrow({ where: { id: input.vendorId }, select: { name: true } });

  const updated = await db.warrantyClaim.update({
    where: { id: claim.id },
    data: {
      tradeAcceptedAt: new Date(),
      tradeAcceptanceName: input.signatureName ?? vendor.name,
      status: claim.clientAcceptedAt !== null ? WarrantyClaimStatus.COMPLETED : WarrantyClaimStatus.IN_PROGRESS,
    },
  });

  await emitEvent(input.organizationId, "warranty_claim.trade_accepted", { claimId: updated.id, jobId: updated.jobId });

  return updated;
}

export interface AcceptClientSatisfactionInput {
  readonly organizationId: string;
  readonly claimId: string;
  readonly clientId: string;
  readonly signatureName?: string;
}

/** The client confirms they're satisfied with the warranty work. */
export async function acceptClientSatisfaction(input: AcceptClientSatisfactionInput) {
  const claim = await db.warrantyClaim.findFirst({ where: { id: input.claimId, organizationId: input.organizationId } });
  if (!claim) throw new WarrantyClaimNotFoundError(input.claimId);
  if (claim.clientId !== input.clientId) throw new ClientMismatchError(input.claimId);

  const client = await db.client.findUniqueOrThrow({ where: { id: input.clientId }, select: { name: true } });

  const updated = await db.warrantyClaim.update({
    where: { id: claim.id },
    data: {
      clientAcceptedAt: new Date(),
      clientAcceptanceName: input.signatureName ?? client.name,
      status: claim.tradeAcceptedAt !== null ? WarrantyClaimStatus.COMPLETED : claim.status,
    },
  });

  await emitEvent(input.organizationId, "warranty_claim.client_accepted", { claimId: updated.id, jobId: updated.jobId });

  return updated;
}
