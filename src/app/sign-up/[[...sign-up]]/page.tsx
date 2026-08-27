import { SignUp } from "@clerk/nextjs";

import { AuthShell, CLERK_APPEARANCE } from "@/components/shell/AuthShell";

/**
 * Creates a Clerk identity only — it grants no app access by itself. Every
 * page still gates on currentAppUser() (src/lib/auth.ts) finding a matching
 * pre-created User row by email; an unrecognized email signing up here still
 * sees "not signed in" everywhere in the app. Safe to leave public for
 * exactly that reason (CLAUDE.md 7: portal users never get Clerk accounts at
 * all, and a staff account with no matching invite is inert).
 */
export default function SignUpPage() {
  return (
    <AuthShell>
      <SignUp appearance={CLERK_APPEARANCE} />
    </AuthShell>
  );
}
