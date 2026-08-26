import { currentAppUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { ACTIVE_JOB_STATUSES } from "@/lib/job-status";

import { NotSignedIn } from "../not-signed-in";
import { DailyLogClient } from "./daily-log-client";

export const dynamic = "force-dynamic";

export default async function DailyLogPage() {
  let user;
  try {
    user = await currentAppUser();
  } catch (error) {
    return <NotSignedIn detail={error instanceof Error ? error.message : String(error)} />;
  }
  if (!user) return <NotSignedIn />;

  const [jobs, recentLogs] = await Promise.all([
    db.job.findMany({
      where: { organizationId: user.organizationId, status: { in: [...ACTIVE_JOB_STATUSES] } },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    db.dailyLog.findMany({
      where: { organizationId: user.organizationId, authorUserId: user.id },
      orderBy: { createdAt: "desc" },
      take: 10,
      include: { job: { select: { name: true } } },
    }),
  ]);

  const initialRecentLogs = recentLogs.map((log) => ({
    id: log.id,
    jobName: log.job.name,
    note: log.note,
    createdAt: log.createdAt.toISOString(),
  }));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Daily Log</h1>
        <p className="mt-1 text-sm text-black/60 dark:text-white/60">Signed in as {user.name ?? user.email}.</p>
      </div>
      <DailyLogClient jobs={jobs} initialRecentLogs={initialRecentLogs} />
    </div>
  );
}
