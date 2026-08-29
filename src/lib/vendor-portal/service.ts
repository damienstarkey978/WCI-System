/**
 * Staff/agent-facing Vendor management (CLAUDE.md 2.3/2.4, Phase 4). Mirrors
 * src/lib/client-portal/service.ts — creating a Vendor and granting job
 * access are separate steps from inviting one to log in
 * (src/lib/vendor-portal/auth.ts).
 */

import { PurchaseOrderStatus, type ScheduleScope } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
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
  readonly email: string;
  readonly phone?: string | null;
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
      email: input.email,
      phone: input.phone ?? null,
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
 * portal"). Deliberately does not change PurchaseOrderStatus — internal
 * approval and vendor acceptance are two different facts about a PO, tracked
 * in separate fields (status vs vendorSignedAt), exactly as ChangeOrder keeps
 * `status` and `clientSignedAt` independent.
 */
export async function acceptPurchaseOrder(input: AcceptPurchaseOrderInput) {
  const po = await db.purchaseOrder.findFirst({
    where: { id: input.purchaseOrderId, organizationId: input.organizationId },
  });
  if (!po) throw new PurchaseOrderNotFoundError(input.purchaseOrderId);
  if (po.vendorId !== input.vendorId) throw new PurchaseOrderNotAssignedToVendorError(input.purchaseOrderId);
  if (po.status !== PurchaseOrderStatus.APPROVED) {
    throw new PurchaseOrderNotAcceptableError(input.purchaseOrderId, po.status);
  }

  const vendor = await db.vendor.findUniqueOrThrow({ where: { id: input.vendorId }, select: { name: true } });

  const updated = await db.purchaseOrder.update({
    where: { id: po.id },
    data: {
      vendorSignatureName: input.signatureName ?? vendor.name,
      vendorSignedAt: new Date(),
      vendorSignatureIp: input.signatureIp ?? null,
    },
  });

  await emitEvent(input.organizationId, "po.vendor_accepted", {
    purchaseOrderId: updated.id,
    jobId: updated.jobId,
    vendorId: input.vendorId,
  });

  return updated;
}
