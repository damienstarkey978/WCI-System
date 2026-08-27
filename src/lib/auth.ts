/**
 * Human authentication.
 *
 * Staff sign in through Clerk. This module maps a Clerk session onto the app's own
 * `User` row, which is what the rest of the system authorizes against — Clerk supplies
 * identity, WCI OS owns roles and (User × Job) grants (CLAUDE.md 2.4).
 *
 * Portal users (clients, subs) deliberately do **not** get Clerk accounts; they use
 * signed links instead. See CLAUDE.md section 7 for that decision.
 *
 * When Clerk is not configured (local dev, CI), this falls back to a stub user so the
 * app builds and runs without secrets. The stub refuses to activate in production.
 */

import { auth as clerkAuth, currentUser as clerkCurrentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

import type { UserModel } from "@/generated/prisma/models";
import { UserRole } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { devOrganizationSlug, devUserEmail, isClerkConfigured, isProduction } from "@/lib/env";

export type AppUser = UserModel;

export class AuthConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthConfigurationError";
  }
}

/**
 * The signed-in staff user, or null. Never throws for an unauthenticated visitor —
 * callers decide whether that is an error.
 */
export async function currentAppUser(): Promise<AppUser | null> {
  if (!isClerkConfigured()) {
    return devFallbackUser();
  }

  const { userId } = await clerkAuth();
  if (!userId) return null;

  const existing = await db.user.findUnique({ where: { clerkUserId: userId } });
  if (existing) {
    return existing.isActive ? existing : null;
  }

  // First sign-in for an already-invited staff member: link the Clerk identity to the
  // pre-created User row by email. We never create a User implicitly — an unknown email
  // means the person was not invited, and they get no access.
  const clerkUser = await clerkCurrentUser();
  const email = clerkUser?.primaryEmailAddress?.emailAddress?.toLowerCase();
  if (!email) return null;

  const invited = await db.user.findFirst({ where: { email, clerkUserId: null, isActive: true } });
  if (!invited) return null;

  return db.user.update({
    where: { id: invited.id },
    data: { clerkUserId: userId },
  });
}

/**
 * The signed-in staff user for a page, redirecting a signed-out visitor to
 * /sign-in when Clerk is configured — the page-level backstop for
 * src/proxy.ts's route protection. Middleware is the first line of defense,
 * but this covers the same visitor if a deploy platform's Next.js adapter
 * doesn't yet run src/proxy.ts (a very new Next.js 16 filename), so a
 * signed-out visit to a staff page never silently falls through to
 * "no organization found" — that message stays reserved for its original
 * meaning, an actually-unseeded local/dev database (Clerk not configured).
 */
export async function currentAppUserOrRedirect(): Promise<AppUser | null> {
  const user = await currentAppUser();
  if (!user && isClerkConfigured()) {
    redirect("/sign-in");
  }
  return user;
}

/** The signed-in staff user, or throws. Use in routes that require a session. */
export async function requireAppUser(): Promise<AppUser> {
  const user = await currentAppUser();
  if (!user) {
    throw new AuthConfigurationError("Not signed in");
  }
  return user;
}

export async function requireRole(...roles: readonly UserRole[]): Promise<AppUser> {
  const user = await requireAppUser();
  if (!roles.includes(user.role)) {
    throw new AuthConfigurationError(`This action requires one of: ${roles.join(", ")}`);
  }
  return user;
}

/**
 * Dev-only stub: resolves (and creates on first use) a local admin user in the dev
 * organization, so the app is usable before Clerk credentials exist.
 */
async function devFallbackUser(): Promise<AppUser | null> {
  if (isProduction) {
    throw new AuthConfigurationError(
      "Clerk is not configured. Set NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY and CLERK_SECRET_KEY — " +
        "the development auth fallback is disabled in production.",
    );
  }

  const slug = devOrganizationSlug();
  const email = devUserEmail();

  const organization = await db.organization.findUnique({ where: { slug } });
  if (!organization) return null;

  const existing = await db.user.findUnique({
    where: { organizationId_email: { organizationId: organization.id, email } },
  });
  if (existing) return existing;

  return db.user.create({
    data: {
      organizationId: organization.id,
      email,
      name: "Local Developer",
      role: UserRole.ADMIN,
    },
  });
}
