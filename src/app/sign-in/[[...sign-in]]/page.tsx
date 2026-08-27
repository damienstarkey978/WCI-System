import { SignIn } from "@clerk/nextjs";

/**
 * WCI OS's own sign-in page, rather than relying on Clerk's hosted Account
 * Portal (a separate accounts.dev domain) — keeps the whole auth flow on one
 * domain, avoiding any cross-domain session-sync edge cases. Staff sign in
 * here; on first login, currentAppUser() (src/lib/auth.ts) links this Clerk
 * identity to a pre-created User row by matching email — there is no invite
 * link to click, just this page.
 */
export default function SignInPage() {
  return (
    <div className="flex flex-1 items-center justify-center px-6 py-16">
      <SignIn />
    </div>
  );
}
