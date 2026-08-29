import { notFound } from "next/navigation";

import { SetupNotice } from "@/app/admin/setup-notice";
import { currentAppUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { getComputedSchedule } from "@/lib/scheduling/service";

import { AddItemForm } from "./add-item-form";
import { CreateScheduleButton } from "./create-schedule-button";
import { SnapshotBaselineButton } from "./snapshot-baseline-button";

export const dynamic = "force-dynamic";

const MS_PER_DAY = 86_400_000;

export default async function JobSchedulePage({ params }: PageProps<"/jobs/[jobId]/schedule">) {
  const { jobId } = await params;

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
        <h1 className="text-xl font-semibold text-[var(--bt-text)]">Schedule — {job.name}</h1>
        <div className="rounded-lg border bg-[var(--bt-panel-bg)] px-4 py-6 text-center" style={{ borderColor: "var(--bt-border)" }}>
          <p className="mb-3 text-sm text-[var(--bt-muted)]">No schedule yet.</p>
          <CreateScheduleButton jobId={job.id} />
        </div>
      </div>
    );
  }

  const { items, projectFinishDate } = await getComputedSchedule(user.organizationId, scheduleRow.id);

  if (items.length === 0) {
    return (
      <div className="mx-auto flex max-w-5xl flex-col gap-4 p-6">
        <h1 className="text-xl font-semibold text-[var(--bt-text)]">Schedule — {job.name}</h1>
        <AddItemForm jobId={job.id} scheduleId={scheduleRow.id} existingItems={[]} />
        <p className="rounded-lg border bg-[var(--bt-panel-bg)] px-4 py-6 text-center text-sm text-[var(--bt-muted)]" style={{ borderColor: "var(--bt-border)" }}>
          No schedule items yet.
        </p>
      </div>
    );
  }

  const allDates = items.flatMap((item) => [item.startDate, item.endDate, item.baselineStart, item.baselineEnd].filter((d): d is Date => d !== null));
  const rangeStart = new Date(Math.min(...allDates.map((d) => d.getTime())));
  const rangeEnd = new Date(Math.max(...allDates.map((d) => d.getTime())));
  const totalDays = Math.max(1, Math.round((rangeEnd.getTime() - rangeStart.getTime()) / MS_PER_DAY) + 1);
  const hasBaseline = items.some((item) => item.baselineEnd !== null);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4 p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold text-[var(--bt-text)]">Schedule — {job.name}</h1>
        <div className="flex items-center gap-3">
          {projectFinishDate ? (
            <span className="text-sm text-[var(--bt-muted)]">Projected finish: {formatDate(projectFinishDate)}</span>
          ) : null}
          <SnapshotBaselineButton jobId={job.id} scheduleId={scheduleRow.id} hasBaseline={hasBaseline} />
        </div>
      </div>

      <AddItemForm jobId={job.id} scheduleId={scheduleRow.id} existingItems={items.map((item) => ({ id: item.id, title: item.title }))} />

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
                  <span className="ml-1.5 rounded bg-amber-100 px-1 py-0.5 text-[10px] font-semibold text-amber-800">
                    Unconfirmed
                  </span>
                ) : null}
                {hasItemBaseline && varianceDays !== 0 ? (
                  <span
                    className="ml-1.5 rounded px-1 py-0.5 text-[10px] font-semibold"
                    style={varianceDays > 0 ? { background: "#fee2e2", color: "#991b1b" } : { background: "var(--bt-status-open-bg)", color: "var(--bt-status-open-text)" }}
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
    </div>
  );
}
