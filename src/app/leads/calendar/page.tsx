import Link from "next/link";

import { SetupNotice } from "@/app/admin/setup-notice";
import { currentAppUser } from "@/lib/auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

const ACTIVITY_TYPE_LABEL: Record<string, string> = {
  CALL: "Call",
  EMAIL: "Email",
  MEETING: "Meeting",
  NOTE: "Note",
  TASK: "Task",
};

const ACTIVITY_TYPE_COLOR: Record<string, string> = {
  CALL: "#dbeafe",
  EMAIL: "#ede9fe",
  MEETING: "#fef3c7",
  NOTE: "#e5e7eb",
  TASK: "#fee2e2",
};

const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

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

/**
 * "Lead Activity Calendar" (Buildertrend screenshot gap-analysis pass) — a month
 * grid of scheduled/logged lead activities. A CALL/EMAIL/MEETING/NOTE activity is
 * placed on its occurredAt date; an incomplete TASK is placed on its dueDate
 * instead (that's the date it actually needs attention on) and falls back to
 * occurredAt once completed or if it never had one.
 */
export default async function LeadActivityCalendarPage({ searchParams }: PageProps<"/leads/calendar">) {
  let user;
  try {
    user = await currentAppUser();
  } catch (error) {
    return <SetupNotice detail={error instanceof Error ? error.message : String(error)} />;
  }
  if (!user) {
    return <SetupNotice detail="No organization found. Seed the database, then reload." />;
  }

  const { month: monthParam } = await searchParams;
  const { year, month } = parseMonthParam(monthParam);

  const rangeStart = new Date(Date.UTC(year, month, 1));
  const rangeEnd = new Date(Date.UTC(year, month + 1, 1));

  const activities = await db.leadActivity.findMany({
    where: {
      organizationId: user.organizationId,
      OR: [
        { occurredAt: { gte: rangeStart, lt: rangeEnd } },
        { type: "TASK", completedAt: null, dueDate: { gte: rangeStart, lt: rangeEnd } },
      ],
    },
    include: { lead: { select: { id: true, name: true, title: true } } },
  });

  const byDay = new Map<string, typeof activities>();
  for (const activity of activities) {
    const placementDate = activity.type === "TASK" && activity.completedAt === null && activity.dueDate ? activity.dueDate : activity.occurredAt;
    const key = placementDate.toISOString().slice(0, 10);
    byDay.set(key, [...(byDay.get(key) ?? []), activity]);
  }

  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const firstWeekday = rangeStart.getUTCDay();
  const cells: (number | null)[] = [...Array(firstWeekday).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  while (cells.length % 7 !== 0) cells.push(null);

  const prevMonth = month === 0 ? { year: year - 1, month: 11 } : { year, month: month - 1 };
  const nextMonth = month === 11 ? { year: year + 1, month: 0 } : { year, month: month + 1 };
  const monthLabel = rangeStart.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-[var(--bt-text)]">Lead Activity Calendar</h1>
        <div className="flex items-center gap-3 text-sm">
          <Link href={`/leads/calendar?month=${monthKey(prevMonth.year, prevMonth.month)}`} className="text-[var(--bt-primary)] hover:underline">
            ← Prev
          </Link>
          <span className="font-semibold text-[var(--bt-text)]">{monthLabel}</span>
          <Link href={`/leads/calendar?month=${monthKey(nextMonth.year, nextMonth.month)}`} className="text-[var(--bt-primary)] hover:underline">
            Next →
          </Link>
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border" style={{ borderColor: "var(--bt-border)" }}>
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
            const dayActivities = day !== null ? (byDay.get(key) ?? []) : [];
            return (
              <div
                key={key}
                className="min-h-28 border-b border-r p-1.5 last:border-r-0"
                style={{ borderColor: "var(--bt-border)", background: day === null ? "var(--bt-page-bg)" : undefined }}
              >
                {day !== null ? (
                  <>
                    <div className="text-xs font-semibold text-[var(--bt-muted)]">{day}</div>
                    <div className="mt-1 flex flex-col gap-1">
                      {dayActivities.slice(0, 4).map((activity) => (
                        <Link
                          key={activity.id}
                          href={`/leads/${activity.lead.id}?tab=activities`}
                          className="truncate rounded px-1 py-0.5 text-[10px] font-medium"
                          style={{ background: ACTIVITY_TYPE_COLOR[activity.type] ?? "#e5e7eb", color: "#1f2937" }}
                          title={`${ACTIVITY_TYPE_LABEL[activity.type] ?? activity.type}: ${activity.lead.title ?? activity.lead.name}`}
                        >
                          {ACTIVITY_TYPE_LABEL[activity.type] ?? activity.type} — {activity.lead.title ?? activity.lead.name}
                        </Link>
                      ))}
                      {dayActivities.length > 4 ? <span className="text-[10px] text-[var(--bt-muted)]">+{dayActivities.length - 4} more</span> : null}
                    </div>
                  </>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
