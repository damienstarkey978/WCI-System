import Link from "next/link";

const DAY_HEADERS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MS_PER_DAY = 86_400_000;

export interface CalendarItem {
  readonly id: string;
  readonly title: string;
  readonly startDate: Date;
  readonly endDate: Date;
  readonly isCriticalPath: boolean;
}

function monthHref(jobId: string, year: number, monthIndex: number): string {
  const d = new Date(Date.UTC(year, monthIndex, 1));
  return `/jobs/${jobId}/schedule?view=calendar&month=${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Month grid; an item shows on every day it spans (dates are UTC midnights, see scheduling/cpm.ts). */
export function ScheduleCalendar({ jobId, items, year, monthIndex }: { jobId: string; items: readonly CalendarItem[]; year: number; monthIndex: number }) {
  const first = new Date(Date.UTC(year, monthIndex, 1));
  const gridStart = new Date(first.getTime() - first.getUTCDay() * MS_PER_DAY);
  const daysInMonth = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  const weeks = Math.ceil((first.getUTCDay() + daysInMonth) / 7);
  const title = first.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });

  return (
    <div className="rounded-lg border bg-[var(--bt-panel-bg)]" style={{ borderColor: "var(--bt-border)" }}>
      <div className="flex items-center justify-between border-b px-4 py-3" style={{ borderColor: "var(--bt-border)" }}>
        <Link href={monthHref(jobId, year, monthIndex - 1)} className="text-sm font-medium text-[var(--bt-primary)] hover:underline">
          ← Previous
        </Link>
        <h2 className="text-sm font-semibold text-[var(--bt-text)]">{title}</h2>
        <Link href={monthHref(jobId, year, monthIndex + 1)} className="text-sm font-medium text-[var(--bt-primary)] hover:underline">
          Next →
        </Link>
      </div>
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
          const dayItems = items.filter((item) => item.startDate.getTime() <= day.getTime() && item.endDate.getTime() >= day.getTime());
          return (
            <div
              key={index}
              className="min-h-24 border-b border-r p-1.5 text-xs"
              style={{ borderColor: "var(--bt-border)", background: inMonth ? undefined : "color-mix(in srgb, var(--bt-page-bg) 60%, transparent)" }}
            >
              <div className={inMonth ? "font-semibold text-[var(--bt-text)]" : "text-[var(--bt-muted)]"}>{day.getUTCDate()}</div>
              <div className="mt-1 flex flex-col gap-0.5">
                {dayItems.slice(0, 3).map((item) => (
                  <div
                    key={item.id}
                    className="truncate rounded px-1 py-0.5 text-[10px] font-medium text-white"
                    style={{ background: item.isCriticalPath ? "#dc2626" : "var(--bt-primary)" }}
                    title={item.title}
                  >
                    {item.title}
                  </div>
                ))}
                {dayItems.length > 3 ? <div className="text-[10px] text-[var(--bt-muted)]">+{dayItems.length - 3} more</div> : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
