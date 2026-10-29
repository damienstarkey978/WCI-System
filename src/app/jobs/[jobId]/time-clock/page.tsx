import Link from "next/link";
import { notFound } from "next/navigation";

import { SetupNotice } from "@/app/admin/setup-notice";
import { CreateModal } from "@/components/shell/CreateModal";
import { EmptyState } from "@/components/shell/EmptyState";
import { CalendarIcon } from "@/components/shell/icons";
import { PageHeader } from "@/components/shell/PageHeader";
import { currentAppUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDate, formatTime } from "@/lib/format";
import { workedHours } from "@/lib/time-clock/hours";

import { ClockInForm } from "./clock-in-form";
import { ShiftsGrid } from "./shifts-grid";

export const dynamic = "force-dynamic";

const TABS = [
  { key: "all", label: "Shifts" },
  { key: "pending", label: "Needs approval" },
  { key: "map", label: "Map" },
] as const;

export default async function TimeClockPage({ params, searchParams }: PageProps<"/jobs/[jobId]/time-clock">) {
  const { jobId } = await params;
  const { tab: tabParam } = await searchParams;
  const tab = tabParam === "pending" ? "pending" : tabParam === "map" ? "map" : "all";

  let user;
  try {
    user = await currentAppUser();
  } catch (error) {
    return <SetupNotice detail={error instanceof Error ? error.message : String(error)} />;
  }
  if (!user) {
    return <SetupNotice detail="No organization found. Seed the database, then reload." />;
  }

  const job = await db.job.findFirst({ where: { id: jobId, organizationId: user.organizationId } });
  if (!job) notFound();

  const weekStart = new Date();
  weekStart.setUTCHours(0, 0, 0, 0);
  weekStart.setUTCDate(weekStart.getUTCDate() - weekStart.getUTCDay());

  const [entries, users, costCodes, openOnJob, myWeekCount] = await Promise.all([
    db.timeClockEntry.findMany({
      where: {
        jobId: job.id,
        ...(tab === "pending" ? { approvalStatus: "PENDING" as const, clockOutAt: { not: null } } : {}),
      },
      orderBy: { clockInAt: "desc" },
      take: 100,
      include: { user: true, costCode: true, breaks: true },
    }),
    db.user.findMany({
      where: { organizationId: user.organizationId, isActive: true },
      orderBy: { email: "asc" },
      select: { id: true, email: true, name: true },
    }),
    db.costCode.findMany({
      where: { organizationId: user.organizationId, defaultHourlyRateCents: { not: null } },
      orderBy: { code: "asc" },
      select: { id: true, code: true, name: true },
      take: 200,
    }),
    db.timeClockEntry.findMany({
      where: { jobId: job.id, clockOutAt: null },
      include: { user: { select: { name: true, email: true } } },
    }),
    db.timeClockEntry.count({
      where: { jobId: job.id, userId: user.id, clockInAt: { gte: weekStart } },
    }),
  ]);

  const canReview = user.role === "ADMIN" || user.role === "PM";
  const asOf = formatTime(new Date());

  const clockInModal = (
    <CreateModal triggerLabel="Clock In" title="Clock in" size="md">
      <ClockInForm jobId={job.id} jobName={job.name} users={users} costCodes={costCodes} defaultUserId={user.id} />
    </CreateModal>
  );

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4 p-6">
      <PageHeader
        jobName={job.name}
        title="Time Clock"
        action={
          <div className="flex items-center gap-2">
            {clockInModal}
            <Link href="/field/time-clock" className="rounded border px-3 py-2 text-sm font-semibold" style={{ borderColor: "var(--bt-border)" }}>
              Field app
            </Link>
          </div>
        }
      />

      <nav className="flex gap-1 border-b" style={{ borderColor: "var(--bt-border)" }}>
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/jobs/${job.id}/time-clock${t.key === "all" ? "" : `?tab=${t.key}`}`}
            className="-mb-px border-b-2 px-3 py-2 text-sm font-medium transition"
            style={{ borderColor: t.key === tab ? "var(--bt-primary)" : "transparent", color: t.key === tab ? "var(--bt-primary)" : "var(--bt-muted)" }}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      {tab === "all" || tab === "pending" ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg border bg-[var(--bt-panel-bg)] p-3 text-sm text-[var(--bt-muted)]" style={{ borderColor: "var(--bt-border)" }}>
            {myWeekCount === 0
              ? "No shifts recorded for you this week. Clock in to track your daily and weekly hours and breaks on the job."
              : `${myWeekCount} shift${myWeekCount === 1 ? "" : "s"} recorded for you this week on this job.`}
          </div>
          <div className="rounded-lg border bg-[var(--bt-panel-bg)] p-3 text-sm text-[var(--bt-muted)]" style={{ borderColor: "var(--bt-border)" }}>
            {openOnJob.length === 0
              ? `No users clocked in on ${job.name} as of ${asOf}.`
              : `${openOnJob.length} user${openOnJob.length === 1 ? "" : "s"} clocked in: ${openOnJob
                  .map((e) => e.user.name || e.user.email)
                  .join(", ")}.`}
          </div>
        </div>
      ) : null}

      {tab === "map" ? (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-[var(--bt-muted)]">
            Where each worker clocked in and out, from the GPS the field app sent. Each point opens in Google Maps.
          </p>
          {entries.length === 0 ? (
            <EmptyState
              icon={<CalendarIcon className="h-10 w-10" />}
              title="Simplify timekeeping with Time Clock"
              description="Clock in to track hours and breaks on the job."
              action={clockInModal}
            />
          ) : (
            <div className="overflow-x-auto rounded-lg border bg-[var(--bt-panel-bg)]" style={{ borderColor: "var(--bt-border)" }}>
              <table className="w-full min-w-max text-left text-sm">
                <thead>
                  <tr className="border-b text-xs font-semibold uppercase tracking-wide text-[var(--bt-muted)]" style={{ borderColor: "var(--bt-border)" }}>
                    <th className="px-4 py-3">Worker</th>
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3">Clock in</th>
                    <th className="px-4 py-3">Clock out</th>
                    <th className="px-4 py-3">Geofence</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((entry) => {
                    const point = (lat: number | null, lng: number | null) =>
                      lat !== null && lng !== null ? (
                        <a href={`https://www.google.com/maps/search/?api=1&query=${lat},${lng}`} target="_blank" rel="noreferrer" className="text-[var(--bt-primary)] hover:underline">
                          {lat.toFixed(5)}, {lng.toFixed(5)}
                        </a>
                      ) : (
                        <span className="text-[var(--bt-muted)]">No GPS</span>
                      );
                    return (
                      <tr key={entry.id} className="border-b last:border-0" style={{ borderColor: "var(--bt-border)" }}>
                        <td className="px-4 py-2">{entry.user.name || entry.user.email}</td>
                        <td className="px-4 py-2 text-[var(--bt-muted)]">{formatDate(entry.clockInAt)}</td>
                        <td className="px-4 py-2">{point(entry.gpsInLatitude, entry.gpsInLongitude)}</td>
                        <td className="px-4 py-2">
                          {entry.clockOutAt ? point(entry.gpsOutLatitude, entry.gpsOutLongitude) : <span className="text-[var(--bt-muted)]">In progress</span>}
                        </td>
                        <td className="px-4 py-2">
                          {entry.geofenceStatus === "OUTSIDE" ? (
                            <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold" style={{ background: "color-mix(in srgb, var(--bt-danger) 14%, transparent)", color: "var(--bt-danger)" }}>
                              OUTSIDE
                            </span>
                          ) : entry.geofenceStatus === "INSIDE" ? (
                            <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold" style={{ background: "var(--bt-status-open-bg)", color: "var(--bt-status-open-text)" }}>
                              INSIDE
                            </span>
                          ) : (
                            <span className="text-[var(--bt-muted)]">Not checked</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : entries.length === 0 ? (
        <EmptyState
          icon={<CalendarIcon className="h-10 w-10" />}
          title="Simplify timekeeping with Time Clock"
          description="Clock in to track hours and breaks on the job."
          action={clockInModal}
        />
      ) : (
        <ShiftsGrid
          canReview={canReview}
          rows={entries.map((entry) => ({
            id: entry.id,
            jobId: job.id,
            worker: entry.user.name || entry.user.email,
            costCode: entry.costCode.name,
            clockInAt: entry.clockInAt.toISOString(),
            inProgress: entry.clockOutAt === null,
            hours: entry.clockOutAt ? workedHours(entry.clockInAt, entry.clockOutAt, entry.breaks) : 0,
            approvalStatus: entry.approvalStatus,
          }))}
        />
      )}
    </div>
  );
}
