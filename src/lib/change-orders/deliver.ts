/**
 * Send a Change Order to the job's client for approval — mark PENDING_APPROVAL,
 * issue a headless CHANGE_ORDER_APPROVAL link, optionally email it.
 *
 * Damien authorized CO e-sign / Send-for-approval as part of Change Orders E2E
 * parity. Never pushes to QuickBooks (BT still owns QB).
 */

import { ClientActionTokenPurpose } from "@/generated/prisma/enums";
import { appBaseUrl } from "@/lib/app-url";
import { issueApprovalLink } from "@/lib/client-portal/auth";
import { db } from "@/lib/db";
import { EmailNotConfiguredError, sendEmail } from "@/lib/email/send";
import { isTransactionalEmailConfigured } from "@/lib/env";

import {
  ChangeOrderNotFoundError,
  ChangeOrderNotPendingError,
  markChangeOrderSent,
} from "./service";

export class ChangeOrderClientMissingError extends Error {
  constructor() {
    super("This job has no client with portal access. Grant client job access before sending for approval.");
    this.name = "ChangeOrderClientMissingError";
  }
}

export class ChangeOrderClientEmailMissingError extends Error {
  constructor(clientName: string) {
    super(`${clientName} has no email on file. Add an email, or copy the approval link after sending.`);
    this.name = "ChangeOrderClientEmailMissingError";
  }
}

export interface SendChangeOrderForApprovalResult {
  readonly changeOrderId: string;
  readonly approvalUrl: string;
  readonly emailed: boolean;
  readonly emailError?: string;
  readonly needsManualDelivery: boolean;
}

function absoluteApprovalUrl(baseUrl: string, token: string): string {
  const base = baseUrl.replace(/\/+$/, "");
  return `${base}/change-orders/review/${encodeURIComponent(token)}`;
}

export async function sendChangeOrderForApproval(input: {
  readonly organizationId: string;
  readonly changeOrderId: string;
}): Promise<SendChangeOrderForApprovalResult> {
  const changeOrder = await db.changeOrder.findFirst({
    where: { id: input.changeOrderId, organizationId: input.organizationId },
    include: {
      job: {
        select: {
          name: true,
          clientAccess: {
            take: 1,
            include: { client: { select: { id: true, name: true, email: true } } },
          },
        },
      },
      organization: { select: { name: true, contactEmail: true } },
    },
  });
  if (!changeOrder) throw new ChangeOrderNotFoundError(input.changeOrderId);

  const access = changeOrder.job.clientAccess[0];
  if (!access?.client) throw new ChangeOrderClientMissingError();
  const client = access.client;

  // DRAFT → PENDING_APPROVAL (idempotent if already pending — re-issue a fresh link).
  if (changeOrder.status === "DRAFT") {
    await markChangeOrderSent(input.organizationId, changeOrder.id);
  } else if (changeOrder.status !== "PENDING_APPROVAL") {
    throw new ChangeOrderNotPendingError(changeOrder.id, changeOrder.status);
  }

  const { token } = await issueApprovalLink({
    organizationId: input.organizationId,
    clientId: client.id,
    purpose: ClientActionTokenPurpose.CHANGE_ORDER_APPROVAL,
    resourceId: changeOrder.id,
  });

  const baseUrl = await appBaseUrl();
  const approvalUrl = absoluteApprovalUrl(baseUrl, token);
  const base = {
    changeOrderId: changeOrder.id,
    approvalUrl,
  };

  const email = client.email?.trim() || null;
  if (!email) {
    return {
      ...base,
      emailed: false,
      needsManualDelivery: true,
      emailError: new ChangeOrderClientEmailMissingError(client.name).message,
    };
  }

  if (!isTransactionalEmailConfigured()) {
    return { ...base, emailed: false, needsManualDelivery: true };
  }

  try {
    const coNumber = String(changeOrder.number).padStart(4, "0");
    await sendEmail({
      to: email,
      subject: `${changeOrder.organization.name}: Change Order #${coNumber} needs your approval`,
      text: [
        `Hi ${client.name},`,
        "",
        `${changeOrder.organization.name} sent Change Order #${coNumber} ("${changeOrder.title}") for ${changeOrder.job.name}.`,
        "",
        `Review and approve or decline here:`,
        approvalUrl,
        "",
        "This link is single-use and will expire. If you have questions, reply to this email.",
      ].join("\n"),
      html: `
        <p>Hi ${escapeHtml(client.name)},</p>
        <p>${escapeHtml(changeOrder.organization.name)} sent Change Order <strong>#${coNumber}</strong>
        (&ldquo;${escapeHtml(changeOrder.title)}&rdquo;) for <strong>${escapeHtml(changeOrder.job.name)}</strong>.</p>
        <p><a href="${approvalUrl}">Review and approve or decline</a></p>
        <p style="color:#6b7280;font-size:12px">This link is single-use and will expire.</p>
      `,
      replyTo: changeOrder.organization.contactEmail ?? undefined,
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

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
