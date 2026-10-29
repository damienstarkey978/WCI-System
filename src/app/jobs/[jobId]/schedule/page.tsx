import Link from "next/link";
import { notFound } from "next/navigation";

import { SetupNotice } from "@/app/admin/setup-notice";
import { CreateModal } from "@/components/shell/CreateModal";
import { EmptyState } from "@/components/shell/EmptyState";
import { AlertIcon, CalendarIcon } from "@/components/shell/icons";
import { PageHeader } from "@/components/shell/PageHeader";
import { currentAppUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDateUtc as formatDate } from "@/lib/format";
import { getComputedSchedule, listNonWorkingDays } from "@/lib/scheduling/service";

import { CreateScheduleButton } from "./create-schedule-button";
import { PhaseForm } from "./phase-form";
import { ScheduleCalendar } from "./schedule-calendar";
import type { CalendarMode, GanttScale, ScheduleViewKey } from "./schedule-chrome";
import { ScheduleGantt } from "./schedule-gantt";
import { ScheduleListGrid } from "./schedule-list-grid";
import { NewScheduleItemButton } from "./schedule-item-modals";
import { ScheduleToolbar } from "./schedule-toolbar";
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

export default async function JobSchedulePage({ params, searchParams }: PageProps<"/jobs/[jobId]/schedule">) {
  const { jobId } = await params;
  const {
    view: viewParam,
    month: monthParam,
    tab: tabParam,
    critical: criticalParam,
    phases: phasesParam,
    scale: scaleParam,
    cal: calParam,
    today: todayParam,
    day: dayParam,
  } = await searchParams;
  const tab: TabKey = TABS.some((t) => t.key === tabParam) ? (tabParam as TabKey) : "schedule";
  const criticalPath = criticalParam === "1";
  const phasesOn = phasesParam === "1";
  const view: ScheduleViewKey = VIEWS.some((v) => v.key === viewParam) ? (viewParam as ScheduleViewKey) : "gantt";
  const ganttScale: GanttScale = scaleParam === "week" || scaleParam === "month" ? scaleParam : "day";
  const calendarMode: CalendarMode =
    calParam === "week" || calParam === "day" || calParam === "agenda" ? calParam : "month";

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
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 p-4 sm:p-6">
        <PageHeader jobName={job.name} title="Schedule" />
        <EmptyState
          icon={<CalendarIcon className="h-10 w-10" />}
          title="No schedule yet"
          description="Create a schedule to plan phases, calendar items, and the Gantt for this job."
          action={<CreateScheduleButton jobId={job.id} />}
        />
      </div>
    );
  }

  const { items: allItems, projectFinishDate, phases, schedule: scheduleFlags } = await getComputedSchedule(user.organizationId, scheduleRow.id);
  // Critical Path in BT highlights bars — it does not filter the item list.
  const items = allItems;

  const staff = await db.user.findMany({
    where: { organizationId: user.organizationId, isActive: true, role: { not: "AGENT" } },
    select: { id: true, name: true, email: true },
    orderBy: { name: "asc" },
  });
  const staffOptions = staff.map((person) => ({ id: person.id, name: person.name?.trim() || person.email }));
  const itemOptions = allItems.map((item) => ({ id: item.id, title: item.title }));
  const phaseOptions = phases.map((phase) => ({ id: phase.id, name: phase.name }));
  const hasBaselineFlag = allItems.some((item) => item.baselineEnd !== null);

  function itemFormValues(item: (typeof allItems)[number]) {
    return {
      id: item.id,
      title: item.title,
      displayColor: item.displayColor ?? "Olive",
      assigneeUserIds: item.assigneeUserIds ?? [],
      startDate: item.startDate.toISOString().slice(0, 10),
      durationDays: item.durationDays,
      endDate: item.endDate.toISOString().slice(0, 10),
      isHourly: item.isHourly ?? false,
      percentComplete: item.percentCompleteBasisPoints / 100,
      reminderDays: item.reminderDays ?? 1,
      predecessorIds: item.predecessorIds ?? [],
      lagDays: item.lagDays,
      phaseId: item.phaseId,
      tags: item.tags ?? [],
      showOnGantt: item.showOnGantt ?? true,
      clientVisible: item.clientVisible,
      subVisible: item.subVisible,
      notesInternal: item.notesInternal ?? "",
      notesSubs: item.notesSubs ?? "",
      notesClient: item.notesClient ?? "",
      hasBaseline: hasBaselineFlag,
    };
  }

  const newItemButton = (
    <NewScheduleItemButton
      jobId={job.id}
      scheduleId={scheduleRow.id}
      jobName={job.name}
      existingItems={itemOptions}
      phases={phaseOptions}
      staff={staffOptions}
    />
  );

  if (allItems.length === 0) {
    return (
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 p-4 sm:p-6">
        <PageHeader jobName={job.name} title="Schedule" action={newItemButton} />
        <p className="rounded-lg border bg-[var(--bt-panel-bg)] px-4 py-6 text-center text-sm text-[var(--bt-muted)]" style={{ borderColor: "var(--bt-border)" }}>
          No schedule items yet.
        </p>
      </div>
    );
  }

  const monthMatch = typeof monthParam === "string" ? /^(\d{4})-(\d{2})$/.exec(monthParam) : null;
  const rangeStartForCal = allItems.reduce((min, item) => (item.startDate < min ? item.startDate : min), allItems[0]!.startDate);
  const calendarYear = monthMatch ? Number(monthMatch[1]) : rangeStartForCal.getUTCFullYear();
  const calendarMonthIndex = monthMatch ? Math.min(11, Math.max(0, Number(monthMatch[2]) - 1)) : rangeStartForCal.getUTCMonth();

  type GanttRow = { type: "phase"; id: string; name: string } | { type: "item"; item: (typeof items)[number] };
  const ganttRows: GanttRow[] = phasesOn
    ? [
        ...phases.flatMap((phase) => {
          const inPhase = items.filter((item) => item.phaseId === phase.id);
          return [{ type: "phase" as const, id: phase.id, name: phase.name }, ...inPhase.map((item) => ({ type: "item" as const, item }))];
        }),
        ...(items.some((item) => !item.phaseId) ? [{ type: "phase" as const, id: "none", name: "No phase" }] : []),
        ...items.filter((item) => !item.phaseId).map((item) => ({ type: "item" as const, item })),
      ]
    : items.map((item) => ({ type: "item" as const, item }));
  const hasBaseline = allItems.some((item) => item.baselineEnd !== null);

  const phaseSlot = (
    <CreateModal triggerLabel="+ Phase" title="New phase" variant="secondary">
      <PhaseForm jobId={job.id} scheduleId={scheduleRow.id} />
    </CreateModal>
  );

  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-3 p-3 sm:gap-4 sm:p-6">
      <PageHeader
        jobName={job.name}
        title="Schedule"
        action={
          projectFinishDate ? (
            <span className="text-sm text-[var(--bt-muted)]">Projected finish: {formatDate(projectFinishDate)}</span>
          ) : null
        }
      />

      <nav className="flex gap-1 overflow-x-auto border-b" style={{ borderColor: "var(--bt-border)" }}>
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/jobs/${job.id}/schedule${t.key === "schedule" ? "" : `?tab=${t.key}`}`}
            className="-mb-px shrink-0 border-b-2 px-3 py-2 text-sm font-medium transition"
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
        <>
          {!scheduleFlags.isOnline ? (
            <div
              className="flex items-start gap-2 rounded border px-3 py-2.5 text-sm"
              style={{
                borderColor: "#f0d78c",
                background: "#fff8db",
                color: "#7a5b00",
              }}
              role="status"
            >
              <AlertIcon className="mt-0.5 h-4 w-4 shrink-0" />
              <span>Your schedule is offline and is unavailable to subs and clients. Notifications will not be sent.</span>
            </div>
          ) : scheduleFlags.isDraft ? (
            <div
              className="flex items-start gap-2 rounded border px-3 py-2.5 text-sm"
              style={{ borderColor: "#f0d78c", background: "#fff8db", color: "#7a5b00" }}
              role="status"
            >
              <AlertIcon className="mt-0.5 h-4 w-4 shrink-0" />
              <span>Draft mode is on. Clients and subs cannot see this schedule.</span>
            </div>
          ) : null}

          <ScheduleToolbar
            jobId={job.id}
            scheduleId={scheduleRow.id}
            view={view}
            criticalPath={criticalPath}
            phasesOn={phasesOn}
            isDraft={scheduleFlags.isDraft}
            isOnline={scheduleFlags.isOnline}
            ganttScale={ganttScale}
            calendarMode={calendarMode}
            newItemSlot={newItemButton}
            phaseSlot={phaseSlot}
          />

          {view === "list" ? (
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
                phaseId: item.phaseId,
                formValues: itemFormValues(item),
              }))}
              phases={phaseOptions}
              showPhases={phasesOn}
              criticalPath={criticalPath}
              jobId={job.id}
              scheduleId={scheduleRow.id}
              jobName={job.name}
              existingItems={itemOptions}
              staff={staffOptions}
            />
          ) : null}

          {view === "calendar" ? (
            <ScheduleCalendar
              jobId={job.id}
              items={items.map((item) => ({
                id: item.id,
                title: item.title,
                startDate: item.startDate,
                endDate: item.endDate,
                isCriticalPath: item.isCriticalPath,
                displayColor: item.displayColor,
              }))}
              year={calendarYear}
              monthIndex={calendarMonthIndex}
              mode={calendarMode}
              criticalPath={criticalPath}
              focusDay={typeof dayParam === "string" ? dayParam : undefined}
            />
          ) : null}

          {view === "gantt" ? (
            <ScheduleGantt
              jobId={job.id}
              scheduleId={scheduleRow.id}
              jobName={job.name}
              existingItems={itemOptions}
              phases={phaseOptions}
              staff={staffOptions}
              scale={ganttScale}
              criticalPath={criticalPath}
              scrollToToday={todayParam === "1"}
              rows={ganttRows.map((row) =>
                row.type === "phase"
                  ? row
                  : {
                      type: "item" as const,
                      item: {
                        id: row.item.id,
                        title: row.item.title,
                        startDate: row.item.startDate.toISOString(),
                        endDate: row.item.endDate.toISOString(),
                        durationDays: row.item.durationDays,
                        isCriticalPath: row.item.isCriticalPath,
                        displayColor: row.item.displayColor,
                        predecessorIds: row.item.predecessorIds ?? [],
                        baselineStart: row.item.baselineStart?.toISOString() ?? null,
                        baselineEnd: row.item.baselineEnd?.toISOString() ?? null,
                        phaseId: row.item.phaseId,
                        formValues: itemFormValues(row.item),
                      },
                    },
              )}
            />
          ) : null}
        </>
      ) : null}
    </div>
  );
}
