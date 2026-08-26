/**
 * Shown when the admin screens can't reach a seeded organization — the common state on
 * a fresh checkout, where the fix is a setup command rather than a bug report.
 */
export function SetupNotice({ detail }: { detail?: string }) {
  return (
    <div className="rounded-lg border border-amber-300 bg-amber-50 p-6 text-sm text-amber-950 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-100">
      <h2 className="mb-2 text-base font-semibold">Database not ready</h2>
      <p className="mb-4">
        These screens read live data, so they need a Postgres database and the WCI organization seeded.
      </p>
      <ol className="mb-4 list-decimal space-y-1 pl-5">
        <li>
          Set <code className="font-mono">DATABASE_URL</code> in <code className="font-mono">.env</code> (copy{" "}
          <code className="font-mono">.env.example</code>).
        </li>
        <li>
          Run <code className="font-mono">npm run db:migrate</code> to create the schema.
        </li>
        <li>
          Run <code className="font-mono">npm run db:seed</code> to create the organization and cost codes.
        </li>
      </ol>
      {detail ? (
        <pre className="overflow-x-auto rounded bg-amber-100 p-3 font-mono text-xs dark:bg-amber-900/50">{detail}</pre>
      ) : null}
    </div>
  );
}
