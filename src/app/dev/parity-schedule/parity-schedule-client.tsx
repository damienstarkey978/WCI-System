"use client";

/**
 * Client body for /dev/parity-schedule — view comes from the server page’s searchParams
 * so screenshots can deep-link ?view=list|calendar|gantt without relying on Link intercepts.
 */
import { useState } from "react";

import { AlertIcon } from "@/components/shell/icons";
import { PageHeader } from "@/components/shell/PageHeader";

import { ScheduleCalendar } from "@/app/jobs/[jobId]/schedule/schedule-calendar";
import type { CalendarMode, GanttScale, ScheduleViewKey } from "@/app/jobs/[jobId]/schedule/schedule-chrome";
import { ScheduleGantt, type GanttItem } from "@/app/jobs/[jobId]/schedule/schedule-gantt";
import { ScheduleListGrid } from "@/app/jobs/[jobId]/schedule/schedule-list-grid";
import { ScheduleToolbar } from "@/app/jobs/[jobId]/schedule/schedule-toolbar";
import type { ScheduleItemFormValues } from "@/app/jobs/[jobId]/schedule/schedule-item-form";

const JOB_NAME = "455 Purcell Drive-Janice Frasca Cabazares-ADU";
const JOB_ID = "job_purcell_parity";
const SCHEDULE_ID = "sched_purcell_parity";

const RAW_ITEMS: {
  title: string;
  start: string;
  days: number;
  color: string;
  critical?: boolean;
  preds?: string[];
}[] = [
  { title: "Commencement / Start of Work", start: "2026-11-02", days: 1, color: "Olive" },
  { title: "Demo and Dumpster", start: "2026-11-03", days: 2, color: "Olive", preds: ["0"] },
  { title: "Foundation (Concrete / Pad)", start: "2026-11-05", days: 5, color: "Olive", preds: ["1"], critical: true },
  { title: "Underground Plumbing / Electrical", start: "2026-11-12", days: 3, color: "Olive", preds: ["2"], critical: true },
  { title: "Slab", start: "2026-11-17", days: 2, color: "Olive", preds: ["3"], critical: true },
  { title: "Framing", start: "2026-11-19", days: 10, color: "Olive", preds: ["4"], critical: true },
  { title: "Roof Dry-In", start: "2026-12-03", days: 4, color: "Olive", preds: ["5"], critical: true },
  { title: "Windows / Exterior Doors", start: "2026-12-09", days: 3, color: "Blue", preds: ["6"] },
  { title: "Rough Electrical", start: "2026-12-09", days: 4, color: "Orange", preds: ["6"], critical: true },
  { title: "Rough Plumbing", start: "2026-12-09", days: 4, color: "Teal", preds: ["6"] },
  { title: "HVAC Rough", start: "2026-12-12", days: 3, color: "Purple", preds: ["6"] },
  { title: "Insulation", start: "2026-12-16", days: 2, color: "Olive", preds: ["8", "9", "10"], critical: true },
  { title: "Drywall", start: "2026-12-18", days: 5, color: "Olive", preds: ["11"], critical: true },
];

function formValues(
  partial: Partial<ScheduleItemFormValues> & { id: string; title: string; startDate: string; durationDays: number; endDate: string },
): ScheduleItemFormValues & { id: string } {
  return {
    displayColor: "Olive",
    assigneeUserIds: [],
    isHourly: false,
    percentComplete: 0,
    reminderDays: 1,
    predecessorIds: [],
    lagDays: 0,
    phaseId: null,
    tags: [],
    showOnGantt: true,
    clientVisible: true,
    subVisible: true,
    notesInternal: "",
    notesSubs: "",
    notesClient: "",
    hasBaseline: false,
    ...partial,
  };
}

function addWorkingDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  let left = days - 1;
  while (left > 0) {
    d.setUTCDate(d.getUTCDate() + 1);
    const wd = d.getUTCDay();
    if (wd !== 0 && wd !== 6) left -= 1;
  }
  return d.toISOString().slice(0, 10);
}

const GANTT_ITEMS: GanttItem[] = RAW_ITEMS.map((raw, i) => {
  const id = `si_${i}`;
  const end = addWorkingDays(raw.start, raw.days);
  const predecessorIds = (raw.preds ?? []).map((p) => `si_${p}`);
  return {
    id,
    title: raw.title,
    startDate: `${raw.start}T00:00:00.000Z`,
    endDate: `${end}T00:00:00.000Z`,
    durationDays: raw.days,
    isCriticalPath: Boolean(raw.critical),
    displayColor: raw.color,
    predecessorIds,
    baselineStart: null,
    baselineEnd: null,
    phaseId: null,
    formValues: formValues({
      id,
      title: raw.title,
      startDate: raw.start,
      endDate: end,
      durationDays: raw.days,
      displayColor: raw.color,
      predecessorIds,
    }),
  };
});

export function ParityScheduleClient({
  view,
  criticalPath,
  phasesOn,
  calendarMode = "month",
  ganttScale = "day",
}: {
  view: ScheduleViewKey;
  criticalPath: boolean;
  phasesOn: boolean;
  calendarMode?: CalendarMode;
  ganttScale?: GanttScale;
}) {
  const [isDraft] = useState(false);
  const [isOnline] = useState(false);
  const rows = GANTT_ITEMS.map((item) => ({ type: "item" as const, item }));

  return (
    <div className="min-h-screen bg-[var(--bt-page-bg)] p-4 sm:p-6" data-testid="parity-schedule-fixture">
      <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-3">
        <PageHeader
          jobName={JOB_NAME}
          title="Schedule"
          action={<span className="text-sm text-[var(--bt-muted)]">Projected finish: Feb 11, 2027</span>}
        />

        <nav className="flex gap-1 border-b" style={{ borderColor: "var(--bt-border)" }}>
          {["Schedule", "Baseline", "Workday Exceptions"].map((label, i) => (
            <span
              key={label}
              className="-mb-px border-b-2 px-3 py-2 text-sm font-medium"
              style={{ borderColor: i === 0 ? "var(--bt-primary)" : "transparent", color: i === 0 ? "var(--bt-primary)" : "var(--bt-muted)" }}
            >
              {label}
            </span>
          ))}
        </nav>

        {!isOnline ? (
          <div
            className="flex items-start gap-2 rounded border px-3 py-2.5 text-sm"
            style={{ borderColor: "#f0d78c", background: "#fff8db", color: "#7a5b00" }}
            role="status"
          >
            <AlertIcon className="mt-0.5 h-4 w-4 shrink-0" />
            <span>Your schedule is offline and is unavailable to subs and clients. Notifications will not be sent.</span>
          </div>
        ) : null}

        <ScheduleToolbar
          jobId={JOB_ID}
          scheduleId={SCHEDULE_ID}
          view={view}
          criticalPath={criticalPath}
          phasesOn={phasesOn}
          isDraft={isDraft}
          isOnline={isOnline}
          ganttScale={ganttScale}
          calendarMode={calendarMode}
          newItemSlot={
            <button type="button" className="h-9 rounded px-4 text-sm font-semibold text-[var(--bt-on-primary)]" style={{ background: "var(--bt-primary)" }}>
              New Schedule Item
            </button>
          }
        />

        {view === "gantt" ? (
          <ScheduleGantt
            jobId={JOB_ID}
            scheduleId={SCHEDULE_ID}
            jobName={JOB_NAME}
            existingItems={GANTT_ITEMS.map((i) => ({ id: i.id, title: i.title }))}
            phases={[]}
            staff={[]}
            scale={ganttScale}
            criticalPath={criticalPath}
            scrollToToday
            rows={rows}
          />
        ) : null}

        {view === "list" ? (
          <ScheduleListGrid
            rows={GANTT_ITEMS.map((item) => ({
              id: item.id,
              title: item.title,
              startDate: item.startDate,
              endDate: item.endDate,
              durationDays: item.durationDays,
              floatDays: item.isCriticalPath ? 0 : 2,
              isCriticalPath: item.isCriticalPath,
              confirmed: true,
              jobId: JOB_ID,
              percentComplete: 0,
              phaseId: null,
              formValues: item.formValues,
            }))}
            phases={[]}
            showPhases={phasesOn}
            criticalPath={criticalPath}
            jobId={JOB_ID}
            scheduleId={SCHEDULE_ID}
            jobName={JOB_NAME}
            existingItems={GANTT_ITEMS.map((i) => ({ id: i.id, title: i.title }))}
            staff={[]}
          />
        ) : null}

        {view === "calendar" ? (
          <ScheduleCalendar
            jobId={JOB_ID}
            items={GANTT_ITEMS.map((item) => ({
              id: item.id,
              title: item.title,
              startDate: new Date(item.startDate),
              endDate: new Date(item.endDate),
              isCriticalPath: item.isCriticalPath,
              displayColor: item.displayColor,
            }))}
            year={2026}
            monthIndex={10}
            mode={calendarMode}
            criticalPath={criticalPath}
          />
        ) : null}
      </div>
    </div>
  );
}
