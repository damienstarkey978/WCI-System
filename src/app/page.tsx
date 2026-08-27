import { Show, UserButton } from "@clerk/nextjs";
import Link from "next/link";

import { isClerkConfigured } from "@/lib/env";

export default function Home() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center gap-8 px-6 py-16">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">WCI OS</h1>
          <p className="mt-2 text-sm text-black/60 dark:text-white/60">
            Construction management for World Construction Inc. Phase 0 — foundation only: organizations,
            roles, the Job lifecycle, the cost code catalog, and the machine-facing API.
          </p>
        </div>
        {isClerkConfigured() ? (
          <>
            <Show when="signed-out">
              <Link
                href="/sign-in"
                className="shrink-0 rounded-md bg-black px-3 py-2 text-xs font-medium text-white dark:bg-white dark:text-black"
              >
                Sign in
              </Link>
            </Show>
            <Show when="signed-in">
              <UserButton />
            </Show>
          </>
        ) : null}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Link
          href="/admin/jobs"
          className="rounded-lg border border-black/10 p-4 transition hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/10"
        >
          <div className="text-sm font-medium">Jobs</div>
          <div className="mt-1 text-xs text-black/55 dark:text-white/55">
            Create jobs and walk the lifecycle state machine.
          </div>
        </Link>

        <Link
          href="/admin/cost-codes"
          className="rounded-lg border border-black/10 p-4 transition hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/10"
        >
          <div className="text-sm font-medium">Cost codes</div>
          <div className="mt-1 text-xs text-black/55 dark:text-white/55">
            The org-level catalog everything downstream codes against.
          </div>
        </Link>

        <Link
          href="/field"
          className="rounded-lg border border-black/10 p-4 transition hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/10"
        >
          <div className="text-sm font-medium">Field app</div>
          <div className="mt-1 text-xs text-black/55 dark:text-white/55">
            Installable PWA for crews — offline-capable time clock and daily logs.
          </div>
        </Link>
      </div>

      <div className="rounded-lg border border-black/10 p-4 text-xs dark:border-white/15">
        <div className="mb-2 text-sm font-medium">Agent API</div>
        <p className="mb-3 text-black/55 dark:text-white/55">
          Machine consumers authenticate with their own API keys, never a user session.
        </p>
        <pre className="overflow-x-auto rounded bg-black/5 p-3 font-mono dark:bg-white/10">
          npm run issue-api-key -- --name duke{"\n"}
          curl -H &quot;Authorization: Bearer $TOKEN&quot; localhost:3000/api/v1/jobs
        </pre>
      </div>
    </div>
  );
}
