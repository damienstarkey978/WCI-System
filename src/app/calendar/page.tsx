import Link from "next/link";

import { SetupNotice } from "@/app/admin/setup-notice";
import { AppShell } from "@/components/shell/AppShell";
import { notificationBellDataForUser, sidebarJobsForOrg } from "@/components/shell/data";
import { EmptyState } from "@/components/shell/EmptyState";
import { CalendarIcon } from "@/components/shell/icons";
import { currentAppUserOrRedirect } from "@/lib/auth";
import { db } from "@/lib/db";
import { getComputedSchedule } from "@/lib/scheduling/service";

export const dynamic = "force-dynamic";

const WEEKDAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MS_PER_DAY = 86_400_000;

function monthKey(year: number, month: number): string {
  return `${year}-${String(month + 1).padStart(2, "0")}`;
}

function parseMonthParam(value: string | readonly string[] | undefined): { year: number; month: number } {
  const raw = Array.isArray(value) ? value[0] : value;
  const match = raw ? /^(\d{4})-(\d{2})$/.exec(raw) : null;
  const now = new Date();
  if (!match) return { year: now.getUTCFullYear(), month: now.getUTCMonth() };
  return { year: Number(match[1]), month: Number(match[2]) - 1 };
}

type CalendarChip = {
  readonly id: string;
  readonly title: string;
  readonly startDate: Date;
  readonly endDate: Date;
  readonly displayColor: string | null;
  readonly jobId: string;
  readonly jobLabel: string;
};

/**
 * Org-wide schedule calendar — every job's computed ScheduleItems for the month.
 * Per-job Calendar still lives under /jobs/{id}/schedule?view=calendar; this is
 * the global /calendar route Heather expected (404 before).
 */
export default async function GlobalCalendarPage({ searchParams }: PageProps<"/calendar">) {
  let user;
  try {
    user = await currentAppUserOrRedirect();
  } catch (error) {
    return <SetupNotice detail={error instanceof Error ? error.message : String(error)} />;
  }

  const { month: monthParam } = await searchParams;
  const { year, month } = parseMonthParam(monthParam);
  const rangeStart = new Date(Date.UTC(year, month, 1));
  const rangeEnd = new Date(Date.UTC(year, month + 1, 1));

  const [jobs, bell, schedules] = await Promise.all([
    sidebarJobsForOrg(user.organizationId, user),
    notificationBellDataForUser(user.organizationId, user.id),
    db.schedule.findMany({
      where: { organizationId: user.organizationId, job: { isTemplate: false } },
      select: { id: true, jobId: true, job: { select: { id: true, name: true, prefix: true } } },
      take: 100,
    }),
  ]);

  const chips: CalendarChip[] = [];
  // Sequential rather than Promise.all — each call hits the same non-working-day
  // calendar; keeping concurrency low avoids a thundering herd on a cold page.
  for (const schedule of schedules) {
    const { items } = await getComputedSchedule(user.organizationId, schedule.id, { includePhases: false });
    const jobLabel = `${schedule.job.prefix ? `${schedule.job.prefix} ` : ""}${schedule.job.name}`;
    for (const item of items) {
      if (item.startDate >= rangeEnd || item.endDate < rangeStart) continue;
      chips.push({
        id: item.id,
        title: item.title,
        startDate: item.startDate,
        endDate: item.endDate,
        displayColor: item.displayColor,
        jobId: schedule.jobId,
        jobLabel,
      });
    }
  }

  const byDay = new Map<string, CalendarChip[]>();
  for (const item of chips) {
    const start = Math.max(item.startDate.getTime(), rangeStart.getTime());
    const end = Math.min(item.endDate.getTime(), rangeEnd.getTime() - MS_PER_DAY);
    for (let t = start; t <= end; t += MS_PER_DAY) {
      const key = new Date(t).toISOString().slice(0, 10);
      byDay.set(key, [...(byDay.get(key) ?? []), item]);
    }
  }

  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const firstWeekday = rangeStart.getUTCDay();
  const cells: (number | null)[] = [...Array(firstWeekday).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  while (cells.length % 7 !== 0) cells.push(null);

  const prevMonth = month === 0 ? { year: year - 1, month: 11 } : { year, month: month - 1 };
  const nextMonth = month === 11 ? { year: year + 1, month: 0 } : { year, month: month + 1 };
  const monthLabel = rangeStart.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });

  return (
    <AppShell jobs={jobs} notifications={bell.notifications} unreadCount={bell.unreadCount}>
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-3 p-4 sm:gap-4 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-[var(--bt-text)]">Calendar</h1>
            <p className="mt-0.5 text-sm text-[var(--bt-muted)]">Schedule items across every job this month.</p>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <Link href={`/calendar?month=${monthKey(prevMonth.year, prevMonth.month)}`} className="min-h-10 px-2 py-2 text-[var(--bt-primary)] hover:underline sm:min-h-0 sm:py-0">
              ← Prev
            </Link>
            <span className="font-semibold text-[var(--bt-text)]">{monthLabel}</span>
            <Link href={`/calendar?month=${monthKey(nextMonth.year, nextMonth.month)}`} className="min-h-10 px-2 py-2 text-[var(--bt-primary)] hover:underline sm:min-h-0 sm:py-0">
              Next →
            </Link>
          </div>
        </div>

        {chips.length === 0 ? (
          <EmptyState
            icon={<CalendarIcon className="h-10 w-10" />}
            title="Nothing scheduled this month"
            description="Add schedule items on a job and they will show up here."
          />
        ) : (
          <div className="overflow-x-auto rounded-lg border bg-[var(--bt-panel-bg)]" style={{ borderColor: "var(--bt-border)" }}>
            <div className="min-w-[40rem]">
              <div className="grid grid-cols-7 border-b text-xs font-semibold uppercase tracking-wide text-[var(--bt-muted)]" style={{ borderColor: "var(--bt-border)" }}>
                {WEEKDAY_NAMES.map((name) => (
                  <div key={name} className="border-r px-2 py-2 last:border-r-0" style={{ borderColor: "var(--bt-border)" }}>
                    {name}
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-7">
                {cells.map((day, index) => {
                  const key = day !== null ? `${monthKey(year, month)}-${String(day).padStart(2, "0")}` : `blank-${index}`;
                  const dayItems = day !== null ? [...new Map((byDay.get(key) ?? []).map((item) => [item.id, item])).values()] : [];
                  return (
                    <div
                      key={key}
                      className="min-h-24 border-b border-r p-1.5 last:border-r-0 sm:min-h-28"
                      style={{ borderColor: "var(--bt-border)", background: day === null ? "var(--bt-page-bg)" : undefined }}
                    >
                      {day !== null ? (
                        <>
                          <div className="text-xs font-semibold text-[var(--bt-muted)]">{day}</div>
                          <div className="mt-1 flex flex-col gap-1">
                            {dayItems.slice(0, 3).map((item) => (
                              <Link
                                key={item.id}
                                href={`/jobs/${item.jobId}/schedule?view=calendar&month=${monthKey(year, month)}`}
                                className="truncate rounded px-1 py-0.5 text-[10px] font-medium text-white hover:opacity-90"
                                style={{ background: item.displayColor || "var(--bt-primary)" }}
                                title={`${item.jobLabel}: ${item.title}`}
                              >
                                {item.title}
                              </Link>
                            ))}
                            {dayItems.length > 3 ? <div className="text-[10px] text-[var(--bt-muted)]">+{dayItems.length - 3} more</div> : null}
                          </div>
                        </>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
