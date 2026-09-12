import { SignIn } from "@clerk/nextjs";

import { AuthShell, CLERK_APPEARANCE } from "@/components/shell/AuthShell";

/**
 * WCI OS's own sign-in page, rather than relying on Clerk's hosted Account
 * Portal (a separate accounts.dev domain) — keeps the whole auth flow on one
 * domain, avoiding any cross-domain session-sync edge cases. Staff sign in
 * here; on first login, currentAppUser() (src/lib/auth.ts) links this Clerk
 * identity to a pre-created User row by matching email — there is no invite
 * link to click, just this page.
 */
/**
 * Only a path within WCI OS is accepted as a return target. Anything else — an
 * absolute URL, a protocol-relative one — would turn this page into an open redirect,
 * which is exactly the tool a phishing link wants: our real sign-in form, then a bounce
 * to somebody else's site.
 */
function safeReturnPath(value: string | string[] | undefined): string | undefined {
  const candidate = Array.isArray(value) ? value[0] : value;
  if (!candidate || !candidate.startsWith("/") || candidate.startsWith("//")) return undefined;
  return candidate;
}

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // Set when someone was sent here mid-flow — connecting an assistant at
  // /oauth/authorize is the case that needs it, since that URL carries the entire
  // request and losing it strands the client waiting on a callback.
  const returnTo = safeReturnPath((await searchParams).redirect_url);

  return (
    <AuthShell>
      <SignIn appearance={CLERK_APPEARANCE} fallbackRedirectUrl={returnTo} forceRedirectUrl={returnTo} />
    </AuthShell>
  );
}
