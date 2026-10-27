/**
 * Email / Text delivery of a client proposal review link.
 * Damien authorized Send for this feature. Uses the linked Client's primary
 * email/phone only — never invents recipients.
 */

import { ClientActionTokenPurpose } from "@/generated/prisma/enums";
import { issueApprovalLink } from "@/lib/client-portal/auth";
import { db } from "@/lib/db";
import { EmailNotConfiguredError, EmailSendError, sendEmail } from "@/lib/email/send";
import { appBaseUrlFromEnv, isTransactionalEmailConfigured, isTransactionalSmsConfigured } from "@/lib/env";
import { normalizePhoneE164, SmsNotConfiguredError, SmsSendError, sendSms } from "@/lib/sms/send";

import { ProposalNotFoundError, sendProposal } from "./service";

export class ProposalClientContactMissingError extends Error {
  constructor(channel: "email" | "sms") {
    super(
      channel === "email"
        ? "This proposal's client has no email on file. Add one on the client or lead before emailing."
        : "This proposal's client has no phone on file. Add one on the client or lead before texting.",
    );
    this.name = "ProposalClientContactMissingError";
  }
}

export type ProposalDeliveryChannel = "email" | "sms";

export type ProposalDeliveryResult = {
  readonly proposalId: string;
  readonly channel: ProposalDeliveryChannel;
  readonly to: string;
  readonly reviewUrl: string;
  readonly status: "sent" | "already_sent";
};

function absoluteReviewUrl(token: string, requestOrigin?: string): string {
  const base = appBaseUrlFromEnv() ?? requestOrigin?.replace(/\/+$/, "") ?? "";
  const path = `/proposals/review/${token}`;
  return base ? `${base}${path}` : path;
}

async function loadProposalForDelivery(organizationId: string, proposalId: string) {
  const proposal = await db.proposal.findFirst({
    where: { id: proposalId, organizationId },
    include: {
      client: { select: { id: true, name: true, email: true, phone: true } },
      lead: { select: { email: true, phone: true, name: true } },
      organization: { select: { name: true, contactEmail: true } },
    },
  });
  if (!proposal) throw new ProposalNotFoundError(proposalId);
  return proposal;
}

/**
 * Prefer Client.email/phone; fall back to Lead contact when the Client row is blank
 * (common for lead-originated proposals that copied contact into Client incompletely).
 */
function resolveEmail(proposal: Awaited<ReturnType<typeof loadProposalForDelivery>>): string | null {
  const fromClient = proposal.client.email?.trim() || null;
  if (fromClient) return fromClient;
  return proposal.lead?.email?.trim() || null;
}

function resolvePhone(proposal: Awaited<ReturnType<typeof loadProposalForDelivery>>): string | null {
  const fromClient = proposal.client.phone?.trim() || null;
  if (fromClient) return fromClient;
  return proposal.lead?.phone?.trim() || null;
}

async function ensureSentAndIssueLink(
  organizationId: string,
  proposal: Awaited<ReturnType<typeof loadProposalForDelivery>>,
  requestOrigin?: string,
): Promise<{ reviewUrl: string; status: "sent" | "already_sent" }> {
  let status: "sent" | "already_sent" = "already_sent";
  if (proposal.status === "DRAFT") {
    await sendProposal(organizationId, proposal.id);
    status = "sent";
  }

  const { token } = await issueApprovalLink({
    organizationId,
    clientId: proposal.client.id,
    purpose: ClientActionTokenPurpose.PROPOSAL_ACCEPTANCE,
    resourceId: proposal.id,
  });

  return { reviewUrl: absoluteReviewUrl(token, requestOrigin), status };
}

export async function emailProposalToClient(input: {
  readonly organizationId: string;
  readonly proposalId: string;
  readonly requestOrigin?: string;
}): Promise<ProposalDeliveryResult> {
  if (!isTransactionalEmailConfigured()) throw new EmailNotConfiguredError();

  const proposal = await loadProposalForDelivery(input.organizationId, input.proposalId);
  const to = resolveEmail(proposal);
  if (!to) throw new ProposalClientContactMissingError("email");

  const { reviewUrl, status } = await ensureSentAndIssueLink(input.organizationId, proposal, input.requestOrigin);
  const orgName = proposal.organization.name;

  try {
    await sendEmail({
      to,
      subject: `Proposal: ${proposal.title}`,
      replyTo: proposal.organization.contactEmail ?? undefined,
      text: [
        `Hi ${proposal.client.name},`,
        "",
        `${orgName} sent you a proposal: ${proposal.title}.`,
        "",
        `Review and respond here:`,
        reviewUrl,
        "",
        "If the link expires, reply to this email and we'll send a fresh one.",
      ].join("\n"),
      html: `
        <p>Hi ${escapeHtml(proposal.client.name)},</p>
        <p><strong>${escapeHtml(orgName)}</strong> sent you a proposal: <strong>${escapeHtml(proposal.title)}</strong>.</p>
        <p><a href="${escapeAttr(reviewUrl)}">Review and respond to your proposal</a></p>
        <p style="color:#6b7280;font-size:12px">If the link expires, reply to this email and we'll send a fresh one.</p>
      `.trim(),
    });
  } catch (error) {
    if (error instanceof EmailNotConfiguredError || error instanceof EmailSendError) throw error;
    throw error;
  }

  return { proposalId: proposal.id, channel: "email", to, reviewUrl, status };
}

export async function textProposalToClient(input: {
  readonly organizationId: string;
  readonly proposalId: string;
  readonly requestOrigin?: string;
}): Promise<ProposalDeliveryResult> {
  if (!isTransactionalSmsConfigured()) throw new SmsNotConfiguredError();

  const proposal = await loadProposalForDelivery(input.organizationId, input.proposalId);
  const rawPhone = resolvePhone(proposal);
  if (!rawPhone) throw new ProposalClientContactMissingError("sms");
  const to = normalizePhoneE164(rawPhone);
  if (!to) throw new SmsSendError(`"${rawPhone}" doesn't look like a phone number we can text.`);

  const { reviewUrl, status } = await ensureSentAndIssueLink(input.organizationId, proposal, input.requestOrigin);
  const orgName = proposal.organization.name;

  await sendSms({
    to,
    body: `${orgName}: your proposal "${proposal.title}" is ready. Review: ${reviewUrl}`,
  });

  return { proposalId: proposal.id, channel: "sms", to, reviewUrl, status };
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function escapeAttr(value: string): string {
  return escapeHtml(value).replace(/'/g, "&#39;");
}
