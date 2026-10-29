import Link from "next/link";

import type { CalendarMode } from "./schedule-chrome";
import { scheduleBarColor } from "./schedule-colors";

const DAY_HEADERS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MS_PER_DAY = 86_400_000;

export type { CalendarMode };

export interface CalendarItem {
  readonly id: string;
  readonly title: string;
  readonly startDate: Date;
  readonly endDate: Date;
  readonly isCriticalPath: boolean;
  readonly displayColor?: string | null;
}

function calendarHref(
  jobId: string,
  opts: { year: number; monthIndex: number; cal?: CalendarMode; critical?: boolean; day?: string },
): string {
  const d = new Date(Date.UTC(opts.year, opts.monthIndex, 1));
  const sp = new URLSearchParams();
  sp.set("view", "calendar");
  sp.set("month", `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  if (opts.cal && opts.cal !== "month") sp.set("cal", opts.cal);
  if (opts.critical) sp.set("critical", "1");
  if (opts.day) sp.set("day", opts.day);
  return `/jobs/${jobId}/schedule?${sp.toString()}`;
}

function ItemChip({ item, criticalPath }: { item: CalendarItem; criticalPath: boolean }) {
  const bg = criticalPath ? (item.isCriticalPath ? "#2563EB" : "#9ca3af") : scheduleBarColor(item.displayColor);
  return (
    <div className="truncate rounded px-1 py-0.5 text-[10px] font-medium text-white" style={{ background: bg }} title={item.title}>
      {item.title}
    </div>
  );
}

function MonthGrid({
  items,
  year,
  monthIndex,
  criticalPath,
}: {
  items: readonly CalendarItem[];
  year: number;
  monthIndex: number;
  criticalPath: boolean;
}) {
  const first = new Date(Date.UTC(year, monthIndex, 1));
  const gridStart = new Date(first.getTime() - first.getUTCDay() * MS_PER_DAY);
  const daysInMonth = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  const weeks = Math.ceil((first.getUTCDay() + daysInMonth) / 7);
  const today = new Date();
  const todayUtc = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());

  return (
    <>
      <div className="grid grid-cols-7 border-b text-center text-xs font-semibold uppercase tracking-wide text-[var(--bt-muted)]" style={{ borderColor: "var(--bt-border)" }}>
        {DAY_HEADERS.map((day) => (
          <div key={day} className="py-2">
            {day}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {Array.from({ length: weeks * 7 }, (_, index) => {
          const day = new Date(gridStart.getTime() + index * MS_PER_DAY);
          const inMonth = day.getUTCMonth() === monthIndex;
          const isToday = day.getTime() === todayUtc;
          const isWeekend = day.getUTCDay() === 0 || day.getUTCDay() === 6;
          const dayItems = items.filter((item) => item.startDate.getTime() <= day.getTime() && item.endDate.getTime() >= day.getTime());
          return (
            <div
              key={index}
              className="min-h-24 border-b border-r p-1.5 text-xs sm:min-h-28"
              style={{
                borderColor: "var(--bt-border)",
                background: !inMonth
                  ? "color-mix(in srgb, var(--bt-page-bg) 60%, transparent)"
                  : isWeekend
                    ? "color-mix(in srgb, var(--bt-primary) 4%, transparent)"
                    : undefined,
              }}
            >
              <div
                className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs ${inMonth ? "font-semibold text-[var(--bt-text)]" : "text-[var(--bt-muted)]"}`}
                style={isToday ? { background: "var(--bt-primary)", color: "var(--bt-on-primary)" } : undefined}
              >
                {day.getUTCDate()}
              </div>
              <div className="mt-1 flex flex-col gap-0.5">
                {dayItems.slice(0, 3).map((item) => (
                  <ItemChip key={item.id} item={item} criticalPath={criticalPath} />
                ))}
                {dayItems.length > 3 ? <div className="text-[10px] text-[var(--bt-muted)]">+{dayItems.length - 3} more</div> : null}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

function WeekGrid({
  items,
  weekStart,
  criticalPath,
}: {
  items: readonly CalendarItem[];
  weekStart: Date;
  criticalPath: boolean;
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-7">
      {Array.from({ length: 7 }, (_, i) => {
        const day = new Date(weekStart.getTime() + i * MS_PER_DAY);
        const isWeekend = day.getUTCDay() === 0 || day.getUTCDay() === 6;
        const dayItems = items.filter((item) => item.startDate.getTime() <= day.getTime() && item.endDate.getTime() >= day.getTime());
        return (
          <div
            key={i}
            className="min-h-40 border-b border-r p-2"
            style={{
              borderColor: "var(--bt-border)",
              background: isWeekend ? "color-mix(in srgb, var(--bt-primary) 4%, transparent)" : undefined,
            }}
          >
            <div className="mb-2 text-xs font-semibold text-[var(--bt-text)]">
              {DAY_HEADERS[day.getUTCDay()]} {day.getUTCDate()}
            </div>
            <div className="flex flex-col gap-1">
              {dayItems.map((item) => (
                <ItemChip key={item.id} item={item} criticalPath={criticalPath} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function DayColumn({ items, day, criticalPath }: { items: readonly CalendarItem[]; day: Date; criticalPath: boolean }) {
  const dayItems = items.filter((item) => item.startDate.getTime() <= day.getTime() && item.endDate.getTime() >= day.getTime());
  return (
    <div className="min-h-64 p-4">
      <div className="mb-3 text-sm font-semibold text-[var(--bt-text)]">
        {day.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "UTC" })}
      </div>
      {dayItems.length === 0 ? (
        <p className="text-sm text-[var(--bt-muted)]">No schedule items on this day.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {dayItems.map((item) => (
            <li key={item.id} className="flex items-center gap-2 rounded border px-3 py-2" style={{ borderColor: "var(--bt-border)" }}>
              <span className="h-3 w-3 shrink-0 rounded-sm" style={{ background: criticalPath ? (item.isCriticalPath ? "#2563EB" : "#9ca3af") : scheduleBarColor(item.displayColor) }} />
              <span className="text-sm font-medium text-[var(--bt-text)]">{item.title}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function AgendaList({ items, criticalPath }: { items: readonly CalendarItem[]; criticalPath: boolean }) {
  const sorted = [...items].sort((a, b) => a.startDate.getTime() - b.startDate.getTime());
  if (sorted.length === 0) {
    return <p className="px-4 py-8 text-center text-sm text-[var(--bt-muted)]">No schedule items in this range.</p>;
  }
  return (
    <ul className="divide-y" style={{ borderColor: "var(--bt-border)" }}>
      {sorted.map((item) => (
        <li key={item.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
          <span className="h-3 w-3 shrink-0 rounded-sm" style={{ background: criticalPath ? (item.isCriticalPath ? "#2563EB" : "#9ca3af") : scheduleBarColor(item.displayColor) }} />
          <span className="min-w-0 flex-1 text-sm font-medium text-[var(--bt-text)]">{item.title}</span>
          <span className="text-xs text-[var(--bt-muted)]">
            {item.startDate.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })}
            {" – "}
            {item.endDate.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Buildertrend Calendar: Month / Week / Day / Agenda. Dates are UTC midnights (see scheduling/cpm.ts). */
export function ScheduleCalendar({
  jobId,
  items,
  year,
  monthIndex,
  mode = "month",
  criticalPath = false,
  focusDay,
}: {
  jobId: string;
  items: readonly CalendarItem[];
  year: number;
  monthIndex: number;
  mode?: CalendarMode;
  criticalPath?: boolean;
  /** yyyy-mm-dd for Day mode focus; defaults to 1st of month. */
  focusDay?: string;
}) {
  const first = new Date(Date.UTC(year, monthIndex, 1));
  const title = first.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });

  const focus = focusDay && /^\d{4}-\d{2}-\d{2}$/.test(focusDay) ? new Date(`${focusDay}T00:00:00Z`) : first;
  const weekStart = new Date(focus.getTime() - focus.getUTCDay() * MS_PER_DAY);

  const nav =
    mode === "week"
      ? {
          prev: calendarHref(jobId, {
            year: weekStart.getUTCFullYear(),
            monthIndex: weekStart.getUTCMonth(),
            cal: "week",
            critical: criticalPath,
            day: new Date(weekStart.getTime() - 7 * MS_PER_DAY).toISOString().slice(0, 10),
          }),
          next: calendarHref(jobId, {
            year: weekStart.getUTCFullYear(),
            monthIndex: weekStart.getUTCMonth(),
            cal: "week",
            critical: criticalPath,
            day: new Date(weekStart.getTime() + 7 * MS_PER_DAY).toISOString().slice(0, 10),
          }),
          label: `Week of ${weekStart.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })}`,
        }
      : mode === "day"
        ? {
            prev: calendarHref(jobId, {
              year: focus.getUTCFullYear(),
              monthIndex: focus.getUTCMonth(),
              cal: "day",
              critical: criticalPath,
              day: new Date(focus.getTime() - MS_PER_DAY).toISOString().slice(0, 10),
            }),
            next: calendarHref(jobId, {
              year: focus.getUTCFullYear(),
              monthIndex: focus.getUTCMonth(),
              cal: "day",
              critical: criticalPath,
              day: new Date(focus.getTime() + MS_PER_DAY).toISOString().slice(0, 10),
            }),
            label: focus.toLocaleDateString("en-US", { weekday: "short", month: "long", day: "numeric", year: "numeric", timeZone: "UTC" }),
          }
        : {
            prev: calendarHref(jobId, { year, monthIndex: monthIndex - 1, cal: mode, critical: criticalPath }),
            next: calendarHref(jobId, { year, monthIndex: monthIndex + 1, cal: mode, critical: criticalPath }),
            label: title,
          };

  return (
    <div className="overflow-hidden rounded-lg border bg-[var(--bt-panel-bg)]" style={{ borderColor: "var(--bt-border)" }}>
      <div className="flex items-center justify-between border-b px-4 py-3" style={{ borderColor: "var(--bt-border)" }}>
        <Link href={nav.prev} className="text-sm font-medium text-[var(--bt-primary)] hover:underline">
          ← Previous
        </Link>
        <h2 className="text-sm font-semibold text-[var(--bt-text)]">{nav.label}</h2>
        <Link href={nav.next} className="text-sm font-medium text-[var(--bt-primary)] hover:underline">
          Next →
        </Link>
      </div>
      {mode === "month" ? <MonthGrid items={items} year={year} monthIndex={monthIndex} criticalPath={criticalPath} /> : null}
      {mode === "week" ? <WeekGrid items={items} weekStart={weekStart} criticalPath={criticalPath} /> : null}
      {mode === "day" ? <DayColumn items={items} day={focus} criticalPath={criticalPath} /> : null}
      {mode === "agenda" ? <AgendaList items={items} criticalPath={criticalPath} /> : null}
    </div>
  );
}
