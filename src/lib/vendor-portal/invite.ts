/**
 * Inviting a sub/vendor into the vendor portal. One entry point for every caller —
 * the vendor page's Invite button and Jarvis's confirm-gated invite — so they behave
 * the same. Nothing here ever runs on its own or in bulk: a person picks one vendor and
 * clicks Invite.
 *
 *   1. issue a single-use login link (issuePortalLoginInvite; marks the vendor "Pending"),
 *   2. if outbound email is configured, email it to the vendor's address,
 *   3. otherwise (or if sending fails) hand the link back so a person can send it by hand.
 *
 * The link is returned either way — staff are the only callers — so a failed or
 * unconfigured email never strands an invite that has already been issued.
 */

import { db } from "@/lib/db";
import { isTransactionalEmailConfigured } from "@/lib/env";
import { sendEmail } from "@/lib/email/send";
import { issuePortalLoginInvite } from "@/lib/vendor-portal/auth";

export const VENDOR_PORTAL_LOGIN_PATH = "/vendor-portal/login";

export interface VendorInviteResult {
  readonly vendorId: string;
  readonly vendorName: string;
  readonly email: string;
  readonly link: string;
  readonly emailed: boolean;
  /** Set when email is configured but this particular send failed. */
  readonly emailError?: string;
}

export function vendorLoginLink(baseUrl: string, token: string): string {
  return `${baseUrl.replace(/\/+$/, "")}${VENDOR_PORTAL_LOGIN_PATH}?token=${encodeURIComponent(token)}`;
}

export function buildVendorInviteEmail(input: { vendorName: string; contactName: string | null; link: string; companyName: string }) {
  const greeting = input.contactName ? `Hi ${input.contactName.split(/\s+/)[0]},` : "Hello,";
  const text = [
    greeting,
    "",
    `${input.companyName} has invited ${input.vendorName} to its subcontractor portal, where you can see the jobs you're assigned to, your purchase orders, and bid requests.`,
    "",
    `Sign in here: ${input.link}`,
    "",
    "This link works once and expires in 7 days. If it has expired, just ask us to send a new one.",
    "",
    `— ${input.companyName}`,
  ].join("\n");

  const escapedLink = input.link.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
  const html =
    `<p>${greeting}</p>` +
    `<p>${input.companyName} has invited <strong>${escapeHtml(input.vendorName)}</strong> to its subcontractor portal, where you can see the jobs you're assigned to, your purchase orders, and bid requests.</p>` +
    `<p><a href="${escapedLink}">Sign in to the portal</a></p>` +
    `<p style="color:#6b7280;font-size:13px">This link works once and expires in 7 days. If it has expired, just ask us to send a new one.</p>`;

  return { subject: `${input.companyName} invited you to its subcontractor portal`, text, html };
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export async function inviteVendorToPortal(organizationId: string, vendorId: string, baseUrl: string): Promise<VendorInviteResult> {
  const { token } = await issuePortalLoginInvite(organizationId, vendorId);
  const [vendor, organization] = await Promise.all([
    db.vendor.findFirstOrThrow({ where: { id: vendorId, organizationId }, select: { id: true, name: true, email: true, primaryContact: true } }),
    db.organization.findUniqueOrThrow({ where: { id: organizationId }, select: { name: true, contactEmail: true } }),
  ]);

  // issuePortalLoginInvite already refused a vendor with no email.
  const email = vendor.email as string;
  const link = vendorLoginLink(baseUrl, token);
  const base = { vendorId: vendor.id, vendorName: vendor.name, email, link };

  if (!isTransactionalEmailConfigured()) return { ...base, emailed: false };

  try {
    const message = buildVendorInviteEmail({ vendorName: vendor.name, contactName: vendor.primaryContact, link, companyName: organization.name });
    await sendEmail({ to: email, ...message, replyTo: organization.contactEmail ?? undefined });
    return { ...base, emailed: true };
  } catch (error) {
    return { ...base, emailed: false, emailError: error instanceof Error ? error.message : String(error) };
  }
}
