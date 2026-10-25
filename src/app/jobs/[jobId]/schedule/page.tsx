import Link from "next/link";
import { notFound } from "next/navigation";

import { SetupNotice } from "@/app/admin/setup-notice";
import { CreateModal } from "@/components/shell/CreateModal";
import { PageHeader } from "@/components/shell/PageHeader";
import { currentAppUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDateUtc as formatDate } from "@/lib/format";
import { getComputedSchedule, listNonWorkingDays } from "@/lib/scheduling/service";

import { AddItemForm } from "./add-item-form";
import { CreateScheduleButton } from "./create-schedule-button";
import { ScheduleCalendar } from "./schedule-calendar";
import { ScheduleListGrid } from "./schedule-list-grid";
import { WorkdayExceptions } from "./workday-exceptions";
import { SnapshotBaselineButton } from "./snapshot-baseline-button";

export const dynamic = "force-dynamic";

const MS_PER_DAY = 86_400_000;

const VIEWS = [
  { key: "calendar", label: "Calendar" },
  { key: "list", label: "List" },
  { key: "gantt", label: "Gantt" },
] as const;
const TABS = [
  { key: "schedule", label: "Schedule" },
  { key: "baseline", label: "Baseline" },
  { key: "exceptions", label: "Workday Exceptions" },
] as const;
type TabKey = (typeof TABS)[number]["key"];
type ViewKey = (typeof VIEWS)[number]["key"];

export default async function JobSchedulePage({ params, searchParams }: PageProps<"/jobs/[jobId]/schedule">) {
  const { jobId } = await params;
  const { view: viewParam, month: monthParam, tab: tabParam, critical: criticalParam } = await searchParams;
  const tab: TabKey = TABS.some((t) => t.key === tabParam) ? (tabParam as TabKey) : "schedule";
  const criticalOnly = criticalParam === "1";
  const view: ViewKey = VIEWS.some((v) => v.key === viewParam) ? (viewParam as ViewKey) : "gantt";

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

  const scheduleRow = await db.schedule.findFirst({
    where: { jobId: job.id, organizationId: user.organizationId },
    orderBy: { createdAt: "asc" },
  });

  if (!scheduleRow) {
    return (
      <div className="mx-auto flex max-w-5xl flex-col gap-4 p-6">
        <PageHeader jobName={job.name} title="Schedule" />
        <div className="rounded-lg border bg-[var(--bt-panel-bg)] px-4 py-6 text-center" style={{ borderColor: "var(--bt-border)" }}>
          <p className="mb-3 text-sm text-[var(--bt-muted)]">No schedule yet.</p>
          <CreateScheduleButton jobId={job.id} />
        </div>
      </div>
    );
  }

  const { items: allItems, projectFinishDate } = await getComputedSchedule(user.organizationId, scheduleRow.id);
  const items = criticalOnly ? allItems.filter((item) => item.isCriticalPath) : allItems;

  if (allItems.length === 0) {
    return (
      <div className="mx-auto flex max-w-5xl flex-col gap-4 p-6">
        <PageHeader
          jobName={job.name}
          title="Schedule"
          action={
            <CreateModal triggerLabel="New Schedule Item" title="New schedule item">
              <AddItemForm jobId={job.id} scheduleId={scheduleRow.id} existingItems={[]} />
            </CreateModal>
          }
        />
        <p className="rounded-lg border bg-[var(--bt-panel-bg)] px-4 py-6 text-center text-sm text-[var(--bt-muted)]" style={{ borderColor: "var(--bt-border)" }}>
          No schedule items yet.
        </p>
      </div>
    );
  }

  const allDates = allItems.flatMap((item) => [item.startDate, item.endDate, item.baselineStart, item.baselineEnd].filter((d): d is Date => d !== null));
  const rangeStart = new Date(Math.min(...allDates.map((d) => d.getTime())));
  const rangeEnd = new Date(Math.max(...allDates.map((d) => d.getTime())));
  const totalDays = Math.max(1, Math.round((rangeEnd.getTime() - rangeStart.getTime()) / MS_PER_DAY) + 1);
  const monthMatch = typeof monthParam === "string" ? /^(\d{4})-(\d{2})$/.exec(monthParam) : null;
  const calendarYear = monthMatch ? Number(monthMatch[1]) : rangeStart.getUTCFullYear();
  const calendarMonthIndex = monthMatch ? Math.min(11, Math.max(0, Number(monthMatch[2]) - 1)) : rangeStart.getUTCMonth();
  const hasBaseline = allItems.some((item) => item.baselineEnd !== null);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4 p-6">
      <PageHeader
        jobName={job.name}
        title="Schedule"
        action={
          <div className="flex items-center gap-3">
            {projectFinishDate ? (
              <span className="text-sm text-[var(--bt-muted)]">Projected finish: {formatDate(projectFinishDate)}</span>
            ) : null}
            <CreateModal triggerLabel="New Schedule Item" title="New schedule item">
              <AddItemForm jobId={job.id} scheduleId={scheduleRow.id} existingItems={allItems.map((item) => ({ id: item.id, title: item.title }))} />
            </CreateModal>
          </div>
        }
      />

      <nav className="flex gap-1 border-b" style={{ borderColor: "var(--bt-border)" }}>
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/jobs/${job.id}/schedule${t.key === "schedule" ? "" : `?tab=${t.key}`}`}
            className="-mb-px border-b-2 px-3 py-2 text-sm font-medium transition"
            style={{ borderColor: t.key === tab ? "var(--bt-primary)" : "transparent", color: t.key === tab ? "var(--bt-primary)" : "var(--bt-muted)" }}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      {tab === "exceptions" ? (
        <WorkdayExceptions
          jobId={job.id}
          days={(await listNonWorkingDays(user.organizationId)).map((day) => ({ id: day.id, date: day.date.toISOString(), reason: day.reason }))}
        />
      ) : null}

      {tab === "baseline" ? (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-[var(--bt-muted)]">
              A baseline is a snapshot of today&apos;s computed dates. Later changes show here as days ahead or behind it.
            </p>
            <SnapshotBaselineButton jobId={job.id} scheduleId={scheduleRow.id} hasBaseline={hasBaseline} />
          </div>
          <div className="overflow-hidden rounded-lg border bg-[var(--bt-panel-bg)]" style={{ borderColor: "var(--bt-border)" }}>
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b text-xs font-semibold uppercase tracking-wide text-[var(--bt-muted)]" style={{ borderColor: "var(--bt-border)" }}>
                  <th className="px-4 py-3">Title</th>
                  <th className="px-4 py-3">Baseline</th>
                  <th className="px-4 py-3">Current</th>
                  <th className="px-4 py-3 text-right">Variance</th>
                </tr>
              </thead>
              <tbody>
                {allItems.map((item) => {
                  const variance = item.baselineEnd ? Math.round((item.endDate.getTime() - item.baselineEnd.getTime()) / MS_PER_DAY) : null;
                  return (
                    <tr key={item.id} className="border-b last:border-0" style={{ borderColor: "var(--bt-border)" }}>
                      <td className="px-4 py-2 font-medium">{item.title}</td>
                      <td className="px-4 py-2 text-[var(--bt-muted)]">
                        {item.baselineStart && item.baselineEnd ? `${formatDate(item.baselineStart)} to ${formatDate(item.baselineEnd)}` : "No baseline"}
                      </td>
                      <td className="px-4 py-2 text-[var(--bt-muted)]">{`${formatDate(item.startDate)} to ${formatDate(item.endDate)}`}</td>
                      <td className="px-4 py-2 text-right" style={variance !== null && variance > 0 ? { color: "var(--bt-danger)", fontWeight: 600 } : undefined}>
                        {variance === null ? "" : `${variance > 0 ? "+" : ""}${variance}d`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {tab === "schedule" ? (
        <div className="flex flex-wrap items-center gap-3">
          <div className="inline-flex overflow-hidden rounded border" style={{ borderColor: "var(--bt-border)" }}>
            {VIEWS.map((v) => (
              <Link
                key={v.key}
                href={`/jobs/${job.id}/schedule?view=${v.key}${criticalOnly ? "&critical=1" : ""}`}
                className="px-3 py-1.5 text-sm font-medium"
                style={v.key === view ? { background: "var(--bt-primary)", color: "var(--bt-on-primary)" } : { color: "var(--bt-muted)" }}
              >
                {v.label}
              </Link>
            ))}
          </div>
          {view === "calendar" ? (
            <Link href={`/jobs/${job.id}/schedule?view=calendar${criticalOnly ? "&critical=1" : ""}&month=${new Date().toISOString().slice(0, 7)}`} className="rounded border px-3 py-1.5 text-sm font-medium" style={{ borderColor: "var(--bt-border)" }}>
              Today
            </Link>
          ) : null}
          <Link
            href={`/jobs/${job.id}/schedule?view=${view}${criticalOnly ? "" : "&critical=1"}`}
            className="inline-flex items-center gap-2 text-sm font-medium text-[var(--bt-text)]"
            aria-pressed={criticalOnly}
          >
            <span className="relative inline-block h-5 w-9 rounded-full" style={{ background: criticalOnly ? "var(--bt-primary)" : "#d1d5db" }}>
              <span className="absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all" style={{ left: criticalOnly ? "18px" : "2px" }} />
            </span>
            Critical path
          </Link>
        </div>
      ) : null}

      {tab === "schedule" && view === "list" ? (
        <ScheduleListGrid
          rows={items.map((item) => ({
            id: item.id,
            title: item.title,
            startDate: item.startDate.toISOString(),
            endDate: item.endDate.toISOString(),
            durationDays: item.durationDays,
            floatDays: item.floatDays,
            isCriticalPath: item.isCriticalPath,
            confirmed: item.confirmationStatus !== "UNCONFIRMED",
            jobId: job.id,
            percentComplete: item.percentCompleteBasisPoints / 100,
          }))}
        />
      ) : null}

      {tab === "schedule" && view === "calendar" ? (
        <ScheduleCalendar jobId={job.id} items={items} year={calendarYear} monthIndex={calendarMonthIndex} />
      ) : null}

      {tab === "schedule" && view === "gantt" && items.length === 0 ? (
        <p className="rounded-lg border bg-[var(--bt-panel-bg)] px-4 py-6 text-center text-sm text-[var(--bt-muted)]" style={{ borderColor: "var(--bt-border)" }}>
          No critical path items.
        </p>
      ) : null}

      {tab === "schedule" && view === "gantt" && items.length > 0 ? (
        <>
      <div className="rounded-lg border bg-[var(--bt-panel-bg)]" style={{ borderColor: "var(--bt-border)" }}>
        <div className="flex border-b text-xs font-semibold uppercase tracking-wide text-[var(--bt-muted)]" style={{ borderColor: "var(--bt-border)" }}>
          <div className="w-64 shrink-0 px-4 py-3">Task</div>
          <div className="w-28 shrink-0 px-4 py-3">Dates</div>
          <div className="flex-1 px-4 py-3">Timeline</div>
        </div>

        {items.map((item) => {
          const offsetDays = Math.round((item.startDate.getTime() - rangeStart.getTime()) / MS_PER_DAY);
          const spanDays = Math.round((item.endDate.getTime() - item.startDate.getTime()) / MS_PER_DAY) + 1;
          const leftPct = (offsetDays / totalDays) * 100;
          const widthPct = Math.max(2, (spanDays / totalDays) * 100);

          const hasItemBaseline = item.baselineStart !== null && item.baselineEnd !== null;
          const baselineOffsetDays = hasItemBaseline
            ? Math.round((item.baselineStart!.getTime() - rangeStart.getTime()) / MS_PER_DAY)
            : 0;
          const baselineSpanDays = hasItemBaseline
            ? Math.round((item.baselineEnd!.getTime() - item.baselineStart!.getTime()) / MS_PER_DAY) + 1
            : 0;
          const baselineLeftPct = (baselineOffsetDays / totalDays) * 100;
          const baselineWidthPct = Math.max(2, (baselineSpanDays / totalDays) * 100);
          const varianceDays = hasItemBaseline
            ? Math.round((item.endDate.getTime() - item.baselineEnd!.getTime()) / MS_PER_DAY)
            : 0;

          return (
            <div key={item.id} className="flex items-center border-b last:border-0" style={{ borderColor: "var(--bt-border)" }}>
              <div className="w-64 shrink-0 truncate px-4 py-3 text-sm text-[var(--bt-text)]">
                {item.title}
                {item.confirmationStatus === "UNCONFIRMED" ? (
                  <span
                    className="ml-1.5 rounded px-1 py-0.5 text-[10px] font-semibold"
                    style={{ background: "color-mix(in srgb, var(--bt-hazard) 14%, transparent)", color: "var(--bt-hazard)" }}
                  >
                    Unconfirmed
                  </span>
                ) : null}
                {hasItemBaseline && varianceDays !== 0 ? (
                  <span
                    className="ml-1.5 rounded px-1 py-0.5 text-[10px] font-semibold"
                    style={
                      varianceDays > 0
                        ? { background: "color-mix(in srgb, var(--bt-danger) 14%, transparent)", color: "var(--bt-danger)" }
                        : { background: "var(--bt-status-open-bg)", color: "var(--bt-status-open-text)" }
                    }
                    title="Difference between the current finish date and the baseline finish date"
                  >
                    {varianceDays > 0 ? `+${varianceDays}d` : `${varianceDays}d`}
                  </span>
                ) : null}
              </div>
              <div className="w-28 shrink-0 px-4 py-3 text-xs text-[var(--bt-muted)]">{formatDate(item.startDate)}</div>
              <div className="relative flex-1 px-4 py-3">
                <div className="relative h-4 w-full">
                  {hasItemBaseline ? (
                    <div
                      className="absolute top-0 h-1.5 rounded-full opacity-50"
                      style={{ left: `${baselineLeftPct}%`, width: `${baselineWidthPct}%`, background: "var(--bt-muted)" }}
                      title={`Baseline: ${formatDate(item.baselineStart!)} – ${formatDate(item.baselineEnd!)}`}
                    />
                  ) : null}
                  <div
                    className="absolute h-4 rounded"
                    style={{
                      top: hasItemBaseline ? "6px" : 0,
                      left: `${leftPct}%`,
                      width: `${widthPct}%`,
                      background: item.isCriticalPath ? "#dc2626" : "var(--bt-primary)",
                    }}
                    title={`${formatDate(item.startDate)} – ${formatDate(item.endDate)}${item.isCriticalPath ? " (critical path)" : ""}`}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <p className="flex items-center gap-4 text-xs text-[var(--bt-muted)]">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded" style={{ background: "var(--bt-primary)" }} />
          On schedule
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded bg-red-600" />
          Critical path
        </span>
        {hasBaseline ? (
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-1.5 w-2.5 rounded-full opacity-50" style={{ background: "var(--bt-muted)" }} />
            Baseline
          </span>
        ) : null}
      </p>
        </>
      ) : null}
    </div>
  );
}
