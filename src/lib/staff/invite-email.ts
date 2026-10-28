/**
 * Sign-in instructions for a pre-authorized staff User. Staff auth is Clerk
 * (no WCI OS password) — this email only tells them where to sign in / sign up
 * with the email that was pre-authorized on /staff.
 *
 * Same Resend path as vendor portal invites (EMAIL_PROVIDER_API_KEY + EMAIL_FROM).
 * When email isn't configured, callers get emailed: false and can still show the
 * sign-in URL for hand delivery.
 */

import { db } from "@/lib/db";
import { EmailNotConfiguredError, EmailSendError, sendEmail } from "@/lib/email/send";
import { isTransactionalEmailConfigured } from "@/lib/env";
import { StaffMemberNotFoundError } from "@/lib/staff/service";

export interface StaffInviteEmailResult {
  readonly userId: string;
  readonly email: string;
  readonly name: string | null;
  readonly signInUrl: string;
  readonly signUpUrl: string;
  readonly emailed: boolean;
  readonly emailError?: string;
}

export function staffSignInUrl(baseUrl: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/sign-in`;
}

export function staffSignUpUrl(baseUrl: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/sign-up`;
}

export function buildStaffInviteEmail(input: {
  readonly recipientName: string | null;
  readonly email: string;
  readonly companyName: string;
  readonly signInUrl: string;
  readonly signUpUrl: string;
}) {
  const first = input.recipientName?.trim().split(/\s+/)[0];
  const greeting = first ? `Hi ${first},` : "Hello,";
  const text = [
    greeting,
    "",
    `${input.companyName} has added you as a staff user in WCI OS.`,
    "",
    `Sign in with this email address (${input.email}) — there is no separate WCI OS password. Use the same Google / email sign-in Clerk offers:`,
    input.signInUrl,
    "",
    `If you don't have an account yet, create one with that same email here:`,
    input.signUpUrl,
    "",
    "After you sign in once, your access is linked automatically.",
    "",
    `— ${input.companyName}`,
  ].join("\n");

  const escapedSignIn = escapeAttr(input.signInUrl);
  const escapedSignUp = escapeAttr(input.signUpUrl);
  const html =
    `<p>${escapeHtml(greeting)}</p>` +
    `<p>${escapeHtml(input.companyName)} has added you as a staff user in WCI OS.</p>` +
    `<p>Sign in with <strong>${escapeHtml(input.email)}</strong> — there is no separate WCI OS password. Use the Google / email sign-in Clerk offers:</p>` +
    `<p><a href="${escapedSignIn}">Sign in to WCI OS</a></p>` +
    `<p>If you don't have an account yet, <a href="${escapedSignUp}">create one with that same email</a>.</p>` +
    `<p style="color:#6b7280;font-size:13px">After you sign in once, your access is linked automatically.</p>`;

  return {
    subject: `${input.companyName} — sign in to WCI OS`,
    text,
    html,
  };
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeAttr(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}

export async function emailStaffSignInInstructions(
  organizationId: string,
  userId: string,
  baseUrl: string,
): Promise<StaffInviteEmailResult> {
  const [member, organization] = await Promise.all([
    db.user.findFirst({
      where: { id: userId, organizationId },
      select: { id: true, email: true, name: true, isActive: true },
    }),
    db.organization.findUniqueOrThrow({
      where: { id: organizationId },
      select: { name: true, contactEmail: true },
    }),
  ]);
  if (!member) throw new StaffMemberNotFoundError(userId);

  const signInUrl = staffSignInUrl(baseUrl);
  const signUpUrl = staffSignUpUrl(baseUrl);
  const base = {
    userId: member.id,
    email: member.email,
    name: member.name,
    signInUrl,
    signUpUrl,
  };

  if (!member.isActive) {
    return { ...base, emailed: false, emailError: "This account is deactivated." };
  }

  if (!isTransactionalEmailConfigured()) {
    return { ...base, emailed: false };
  }

  try {
    const message = buildStaffInviteEmail({
      recipientName: member.name,
      email: member.email,
      companyName: organization.name,
      signInUrl,
      signUpUrl,
    });
    await sendEmail({
      to: member.email,
      ...message,
      replyTo: organization.contactEmail ?? undefined,
    });
    return { ...base, emailed: true };
  } catch (error) {
    if (error instanceof EmailNotConfiguredError) {
      return { ...base, emailed: false };
    }
    const detail =
      error instanceof EmailSendError
        ? error.message
        : error instanceof Error
          ? error.message
          : String(error);
    return { ...base, emailed: false, emailError: detail };
  }
}
