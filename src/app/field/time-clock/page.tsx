import { currentAppUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { ACTIVE_JOB_STATUSES } from "@/lib/job-status";

import { NotSignedIn } from "../not-signed-in";
import { TimeClockClient } from "./time-clock-client";

export const dynamic = "force-dynamic";

export default async function TimeClockPage() {
  let user;
  try {
    user = await currentAppUser();
  } catch (error) {
    return <NotSignedIn detail={error instanceof Error ? error.message : String(error)} />;
  }
  if (!user) return <NotSignedIn />;

  const [jobs, costCodes, openEntry] = await Promise.all([
    db.job.findMany({
      where: { organizationId: user.organizationId, status: { in: [...ACTIVE_JOB_STATUSES] } },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    db.costCode.findMany({
      where: { organizationId: user.organizationId, isActive: true, defaultHourlyRateCents: { not: null } },
      orderBy: { code: "asc" },
      select: { id: true, code: true, name: true },
    }),
    db.timeClockEntry.findFirst({
      where: { organizationId: user.organizationId, userId: user.id, clockOutAt: null },
      include: { breaks: true, job: { select: { name: true } } },
    }),
  ]);

  const initialEntry = openEntry
    ? {
        id: openEntry.id,
        jobName: openEntry.job.name,
        clockInAt: openEntry.clockInAt.toISOString(),
        openBreak: openEntry.breaks.some((entryBreak) => entryBreak.endAt === null),
      }
    : null;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Time Clock</h1>
        <p className="mt-1 text-sm text-black/60 dark:text-white/60">Signed in as {user.name ?? user.email}.</p>
      </div>
      <TimeClockClient jobs={jobs} costCodes={costCodes} initialEntry={initialEntry} />
    </div>
  );
}
