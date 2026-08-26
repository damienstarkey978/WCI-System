/**
 * Shown when no Clerk session resolves to a staff User (CLAUDE.md 7: WCI OS has no
 * self-serve sign-up yet — a person is invited by email first, same gap /admin has),
 * or when currentAppUser() itself threw (e.g. Clerk isn't configured at all — same
 * failure mode src/app/admin/setup-notice.tsx guards against for the admin screens).
 */
export function NotSignedIn({ detail }: { detail?: string }) {
  return (
    <div className="rounded-lg border border-amber-300 bg-amber-50 p-6 text-sm text-amber-950 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-100">
      <h2 className="mb-2 text-base font-semibold">Not signed in</h2>
      <p>
        You need to be signed in as an invited WCI staff member to use the field app. Ask your PM or office admin
        to invite you, then sign in again.
      </p>
      {detail ? (
        <pre className="mt-4 overflow-x-auto rounded bg-amber-100 p-3 font-mono text-xs dark:bg-amber-900/50">{detail}</pre>
      ) : null}
    </div>
  );
}
