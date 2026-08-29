import Link from "next/link";

import { currentAppUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { ACTIVE_JOB_STATUSES } from "@/lib/job-status";

import { NotSignedIn } from "./not-signed-in";

export const dynamic = "force-dynamic";

export default async function FieldHomePage() {
  let user;
  try {
    user = await currentAppUser();
  } catch (error) {
    return <NotSignedIn detail={error instanceof Error ? error.message : String(error)} />;
  }
  if (!user) return <NotSignedIn />;

  const [openEntry, jobCount] = await Promise.all([
    db.timeClockEntry.findFirst({
      where: { organizationId: user.organizationId, userId: user.id, clockOutAt: null },
      include: { job: { select: { name: true } } },
    }),
    db.job.count({ where: { organizationId: user.organizationId, status: { in: [...ACTIVE_JOB_STATUSES] } } }),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Hi, {user.name ?? user.email}</h1>
        <p className="mt-1 text-sm text-black/60 dark:text-white/60">
          {jobCount} active job{jobCount === 1 ? "" : "s"} right now.
        </p>
      </div>

      <div className="rounded-lg border border-black/10 p-4 dark:border-white/15">
        <div className="text-sm font-medium">Time Clock</div>
        {openEntry ? (
          <p className="mt-1 text-xs text-black/55 dark:text-white/55">
            Clocked in at <span className="font-medium">{openEntry.job.name}</span> since{" "}
            {openEntry.clockInAt.toLocaleTimeString()}.
          </p>
        ) : (
          <p className="mt-1 text-xs text-black/55 dark:text-white/55">Not clocked in.</p>
        )}
        <Link
          href="/field/time-clock"
          className="mt-3 inline-block rounded-md bg-black px-3 py-2 text-xs font-medium text-white dark:bg-[var(--bt-panel-bg)] dark:text-black"
        >
          {openEntry ? "Manage clock" : "Clock in"}
        </Link>
      </div>

      <div className="rounded-lg border border-black/10 p-4 dark:border-white/15">
        <div className="text-sm font-medium">Daily Log</div>
        <p className="mt-1 text-xs text-black/55 dark:text-white/55">Log today&apos;s progress, even with no signal.</p>
        <Link
          href="/field/daily-log"
          className="mt-3 inline-block rounded-md bg-black px-3 py-2 text-xs font-medium text-white dark:bg-[var(--bt-panel-bg)] dark:text-black"
        >
          Write a log
        </Link>
      </div>
    </div>
  );
}
