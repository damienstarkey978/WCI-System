/**
 * Staff/agent-facing Vendor management (CLAUDE.md 2.3/2.4, Phase 4). Mirrors
 * src/lib/client-portal/service.ts — creating a Vendor and granting job
 * access are separate steps from inviting one to log in
 * (src/lib/vendor-portal/auth.ts).
 */

import { PurchaseOrderStatus, type ScheduleScope } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { approvePurchaseOrder } from "@/lib/purchase-orders/workflow";
import { emitEvent } from "@/lib/webhooks";

export class JobNotFoundError extends Error {
  constructor(jobId: string) {
    super(`Job ${jobId} not found`);
    this.name = "JobNotFoundError";
  }
}

export class VendorNotFoundError extends Error {
  constructor(vendorId: string) {
    super(`Vendor ${vendorId} not found`);
    this.name = "VendorNotFoundError";
  }
}

export interface CreateVendorInput {
  readonly organizationId: string;
  readonly name: string;
  readonly tradeType?: string | null;
  /** Optional — a vendor with no email on file (common for imported subs) just can't be invited to the portal. */
  readonly email?: string | null;
  readonly phone?: string | null;
  readonly cellPhone?: string | null;
  readonly primaryContact?: string | null;
  readonly divisions?: readonly string[];
  readonly addressLine1?: string | null;
  readonly city?: string | null;
  readonly state?: string | null;
  readonly postalCode?: string | null;
}

export async function createVendor(input: CreateVendorInput) {
  return db.vendor.create({
    data: {
      organizationId: input.organizationId,
      name: input.name,
      tradeType: input.tradeType ?? null,
      email: input.email ?? null,
      phone: input.phone ?? null,
      cellPhone: input.cellPhone ?? null,
      primaryContact: input.primaryContact ?? null,
      divisions: input.divisions ? [...input.divisions] : [],
      addressLine1: input.addressLine1 ?? null,
      city: input.city ?? null,
      state: input.state ?? null,
      postalCode: input.postalCode ?? null,
    },
  });
}

export interface GrantVendorJobAccessInput {
  readonly organizationId: string;
  readonly vendorId: string;
  readonly jobId: string;
  readonly scheduleScope?: ScheduleScope;
  readonly canViewDocuments?: boolean;
  readonly canViewPurchaseOrders?: boolean;
  readonly canViewBills?: boolean;
}

/** Upsert, same reasoning as grantJobAccess in client-portal/service.ts. */
export async function grantVendorJobAccess(input: GrantVendorJobAccessInput) {
  const [vendor, job] = await Promise.all([
    db.vendor.findFirst({ where: { id: input.vendorId, organizationId: input.organizationId }, select: { id: true } }),
    db.job.findFirst({ where: { id: input.jobId, organizationId: input.organizationId }, select: { id: true } }),
  ]);
  if (!vendor) throw new VendorNotFoundError(input.vendorId);
  if (!job) throw new JobNotFoundError(input.jobId);

  const flags = {
    scheduleScope: input.scheduleScope,
    canViewDocuments: input.canViewDocuments,
    canViewPurchaseOrders: input.canViewPurchaseOrders,
    canViewBills: input.canViewBills,
  };

  return db.vendorJobAccess.upsert({
    where: { vendorId_jobId: { vendorId: input.vendorId, jobId: input.jobId } },
    create: { vendorId: input.vendorId, jobId: input.jobId, ...flags },
    update: flags,
  });
}

/** Idempotent — revoking access that's already gone is a no-op, not an error. */
export async function revokeVendorJobAccess(organizationId: string, vendorId: string, jobId: string): Promise<void> {
  await db.vendorJobAccess.deleteMany({ where: { vendorId, jobId, job: { organizationId } } });
}

export interface AddCertificationInput {
  readonly organizationId: string;
  readonly vendorId: string;
  readonly title: string;
  readonly expiresAt: Date;
  readonly notes?: string | null;
}

export async function addCertification(input: AddCertificationInput) {
  const vendor = await db.vendor.findFirst({ where: { id: input.vendorId, organizationId: input.organizationId } });
  if (!vendor) throw new VendorNotFoundError(input.vendorId);

  return db.vendorCertification.create({
    data: {
      vendorId: input.vendorId,
      title: input.title,
      expiresAt: input.expiresAt,
      notes: input.notes ?? null,
    },
  });
}

/** Certifications expiring within `withinDays` (default 30), soonest first. */
export async function listExpiringCertifications(organizationId: string, withinDays = 30) {
  const cutoff = new Date(Date.now() + withinDays * 24 * 60 * 60 * 1000);
  return db.vendorCertification.findMany({
    where: { vendor: { organizationId }, expiresAt: { lte: cutoff } },
    orderBy: { expiresAt: "asc" },
    include: { vendor: { select: { id: true, name: true, email: true } } },
  });
}

export class PurchaseOrderNotFoundError extends Error {
  constructor(purchaseOrderId: string) {
    super(`Purchase order ${purchaseOrderId} not found`);
    this.name = "PurchaseOrderNotFoundError";
  }
}

export class PurchaseOrderNotAssignedToVendorError extends Error {
  constructor(purchaseOrderId: string) {
    super(`Purchase order ${purchaseOrderId} is not assigned to this vendor.`);
    this.name = "PurchaseOrderNotAssignedToVendorError";
  }
}

export class PurchaseOrderNotAcceptableError extends Error {
  constructor(purchaseOrderId: string, status: string) {
    super(`Purchase order ${purchaseOrderId} is ${status} and cannot be accepted.`);
    this.name = "PurchaseOrderNotAcceptableError";
  }
}

export interface AcceptPurchaseOrderInput {
  readonly organizationId: string;
  readonly purchaseOrderId: string;
  readonly vendorId: string;
  readonly signatureName?: string;
  readonly signatureIp?: string;
}

/**
 * A vendor's e-sign acceptance of a PO (CLAUDE.md 3: "PO acceptance+e-sign in
 * portal"). From PENDING_APPROVAL this routes through approvePurchaseOrder with
 * approvedBy=VENDOR so status, agreement snapshot, and signature fields stay in
 * sync. An already-APPROVED PO that somehow lacks a vendor signature only stamps
 * the signature fields (legacy / internal-approved then forwarded path).
 */
export async function acceptPurchaseOrder(input: AcceptPurchaseOrderInput) {
  const po = await db.purchaseOrder.findFirst({
    where: { id: input.purchaseOrderId, organizationId: input.organizationId },
  });
  if (!po) throw new PurchaseOrderNotFoundError(input.purchaseOrderId);
  if (po.vendorId !== input.vendorId) throw new PurchaseOrderNotAssignedToVendorError(input.purchaseOrderId);

  const vendor = await db.vendor.findUniqueOrThrow({ where: { id: input.vendorId }, select: { name: true } });
  const signatureName = input.signatureName ?? vendor.name;

  if (po.status === PurchaseOrderStatus.PENDING_APPROVAL) {
    const updated = await approvePurchaseOrder({
      organizationId: input.organizationId,
      purchaseOrderId: input.purchaseOrderId,
      approvedBy: "VENDOR",
      vendorSignatureName: signatureName,
      vendorSignatureIp: input.signatureIp ?? null,
    });
    await emitEvent(input.organizationId, "po.vendor_accepted", {
      purchaseOrderId: updated.id,
      jobId: updated.jobId,
      vendorId: input.vendorId,
    });
    return updated;
  }

  if (po.status === PurchaseOrderStatus.APPROVED && !po.vendorSignedAt) {
    const updated = await db.purchaseOrder.update({
      where: { id: po.id },
      data: {
        vendorSignatureName: signatureName,
        vendorSignedAt: new Date(),
        vendorSignatureIp: input.signatureIp ?? null,
        agreementSnapshot: po.agreementSnapshot ?? po.scopeOfWork,
        agreementSnapshotAt: po.agreementSnapshotAt ?? new Date(),
        approvedBy: "VENDOR",
      },
    });
    await emitEvent(input.organizationId, "po.vendor_accepted", {
      purchaseOrderId: updated.id,
      jobId: updated.jobId,
      vendorId: input.vendorId,
    });
    return updated;
  }

  throw new PurchaseOrderNotAcceptableError(input.purchaseOrderId, po.status);
}

export interface UpdateVendorContactInput {
  readonly organizationId: string;
  readonly vendorId: string;
  readonly name: string;
  readonly email: string | null;
  readonly primaryContact: string | null;
  readonly phone: string | null;
  readonly cellPhone: string | null;
}

/** Edit a vendor's company name and contact details — the way to add the email an imported sub came without. */
export async function updateVendorContact(input: UpdateVendorContactInput) {
  const existing = await db.vendor.findFirst({ where: { id: input.vendorId, organizationId: input.organizationId }, select: { id: true } });
  if (!existing) throw new VendorNotFoundError(input.vendorId);

  return db.vendor.update({
    where: { id: input.vendorId },
    data: { name: input.name, email: input.email, primaryContact: input.primaryContact, phone: input.phone, cellPhone: input.cellPhone },
  });
}
