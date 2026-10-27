/**
 * Send a PO to its assigned vendor for approval — status transition plus a
 * headless accept link, optionally emailed. Damien authorized Email/Send for
 * this PO Send-to-sub flow (preferences 2026-10-27).
 */

import { VendorActionTokenPurpose } from "@/generated/prisma/enums";
import { appBaseUrl } from "@/lib/app-url";
import { db } from "@/lib/db";
import { EmailNotConfiguredError, sendEmail } from "@/lib/email/send";
import { isTransactionalEmailConfigured } from "@/lib/env";
import { issueApprovalLink, VendorNotFoundError } from "@/lib/vendor-portal/auth";

import {
  InvalidPurchaseOrderTransitionError,
  PurchaseOrderNotFoundError,
  sendForApproval,
  type PurchaseOrderActor,
} from "./workflow";

export class PurchaseOrderVendorMissingError extends Error {
  constructor() {
    super("Assign a vendor with a portal account before sending for approval.");
    this.name = "PurchaseOrderVendorMissingError";
  }
}

export class PurchaseOrderVendorEmailMissingError extends Error {
  constructor(vendorName: string) {
    super(`${vendorName} has no email on file. Add an email, or copy the accept link after sending.`);
    this.name = "PurchaseOrderVendorEmailMissingError";
  }
}

export interface SendPurchaseOrderToVendorResult {
  readonly purchaseOrderId: string;
  readonly poNumber: string;
  readonly acceptUrl: string;
  readonly emailed: boolean;
  readonly emailError?: string;
  /** When email isn't configured or vendor has no email — staff must share the link. */
  readonly needsManualDelivery: boolean;
}

function absoluteAcceptUrl(baseUrl: string, purchaseOrderId: string, token: string): string {
  const base = baseUrl.replace(/\/+$/, "");
  return `${base}/vendor-portal/purchase-orders/${purchaseOrderId}/accept?token=${encodeURIComponent(token)}`;
}

function buildPoSendEmail(input: {
  readonly vendorName: string;
  readonly contactName: string | null;
  readonly companyName: string;
  readonly jobName: string;
  readonly poNumber: string;
  readonly title: string | null;
  readonly acceptUrl: string;
}) {
  const greeting = input.contactName ? `Hi ${input.contactName.split(/\s+/)[0]},` : "Hello,";
  const label = input.title ? `${input.poNumber} — ${input.title}` : input.poNumber;
  const text = [
    greeting,
    "",
    `${input.companyName} has sent you purchase order ${label} for ${input.jobName}.`,
    "",
    "Review the scope of work and costs, then accept (e-sign) here:",
    input.acceptUrl,
    "",
    "This link works once. If it has expired, ask the office to re-send the purchase order.",
    "",
    `— ${input.companyName}`,
  ].join("\n");

  const escaped = input.acceptUrl.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
  const html =
    `<p>${greeting}</p>` +
    `<p>${escapeHtml(input.companyName)} has sent you purchase order <strong>${escapeHtml(label)}</strong> for ${escapeHtml(input.jobName)}.</p>` +
    `<p><a href="${escaped}">Review and accept this purchase order</a></p>` +
    `<p style="color:#6b7280;font-size:13px">This link works once. If it has expired, ask the office to re-send the purchase order.</p>`;

  return { subject: `Purchase order ${label} — please review and accept`, text, html };
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Flip the PO to PENDING_APPROVAL, mint a PO_ACCEPTANCE token, and email the
 * vendor when possible. Always returns the accept URL so staff can deliver it
 * out-of-band when email isn't configured (same pattern as portal invites).
 */
export async function sendPurchaseOrderToVendor(input: {
  readonly organizationId: string;
  readonly purchaseOrderId: string;
  readonly actor?: PurchaseOrderActor;
}): Promise<SendPurchaseOrderToVendorResult> {
  const purchaseOrder = await db.purchaseOrder.findFirst({
    where: { id: input.purchaseOrderId, organizationId: input.organizationId },
    include: {
      job: { select: { name: true } },
      vendor: { select: { id: true, name: true, email: true, primaryContact: true } },
      organization: { select: { name: true, contactEmail: true } },
    },
  });
  if (!purchaseOrder) throw new PurchaseOrderNotFoundError(input.purchaseOrderId);
  if (!purchaseOrder.vendorId || !purchaseOrder.vendor) throw new PurchaseOrderVendorMissingError();

  try {
    await sendForApproval({
      organizationId: input.organizationId,
      purchaseOrderId: input.purchaseOrderId,
      actor: input.actor,
    });
  } catch (error) {
    if (error instanceof InvalidPurchaseOrderTransitionError) throw error;
    throw error;
  }

  const { token } = await issueApprovalLink({
    organizationId: input.organizationId,
    vendorId: purchaseOrder.vendorId,
    purpose: VendorActionTokenPurpose.PO_ACCEPTANCE,
    resourceId: purchaseOrder.id,
  });

  const baseUrl = await appBaseUrl();
  const acceptUrl = absoluteAcceptUrl(baseUrl, purchaseOrder.id, token);
  const base = {
    purchaseOrderId: purchaseOrder.id,
    poNumber: purchaseOrder.poNumber,
    acceptUrl,
  };

  const email = purchaseOrder.vendor.email?.trim() || null;
  if (!email) {
    return { ...base, emailed: false, needsManualDelivery: true, emailError: new PurchaseOrderVendorEmailMissingError(purchaseOrder.vendor.name).message };
  }

  if (!isTransactionalEmailConfigured()) {
    return { ...base, emailed: false, needsManualDelivery: true };
  }

  try {
    const message = buildPoSendEmail({
      vendorName: purchaseOrder.vendor.name,
      contactName: purchaseOrder.vendor.primaryContact,
      companyName: purchaseOrder.organization.name,
      jobName: purchaseOrder.job.name,
      poNumber: purchaseOrder.poNumber,
      title: purchaseOrder.title,
      acceptUrl,
    });
    await sendEmail({
      to: email,
      ...message,
      replyTo: purchaseOrder.organization.contactEmail ?? undefined,
    });
    return { ...base, emailed: true, needsManualDelivery: false };
  } catch (error) {
    if (error instanceof EmailNotConfiguredError) {
      return { ...base, emailed: false, needsManualDelivery: true };
    }
    return {
      ...base,
      emailed: false,
      needsManualDelivery: true,
      emailError: error instanceof Error ? error.message : String(error),
    };
  }
}

// Re-export for callers that only need the not-found shape from auth.
export { VendorNotFoundError };
