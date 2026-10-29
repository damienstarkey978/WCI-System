"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { PencilIcon, PlusCircleIcon, PlusIcon } from "@/components/shell/icons";
import { formatDateUtc } from "@/lib/format";

import { deletePhaseAction } from "./actions";
import type { GanttScale } from "./schedule-chrome";
import { scheduleBarColor } from "./schedule-colors";
import type { PhaseOption, ScheduleItemFormValues, ScheduleItemOption, StaffOption } from "./schedule-item-form";
import { EditScheduleItemButton, NewScheduleItemButton } from "./schedule-item-modals";

const MS_PER_DAY = 86_400_000;
const DAY_ABBR = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"] as const;

export interface GanttItem {
  readonly id: string;
  readonly title: string;
  readonly startDate: string;
  readonly endDate: string;
  readonly durationDays: number;
  readonly isCriticalPath: boolean;
  readonly displayColor: string | null;
  readonly predecessorIds: readonly string[];
  readonly baselineStart: string | null;
  readonly baselineEnd: string | null;
  readonly phaseId: string | null;
  readonly formValues: ScheduleItemFormValues & { id: string };
}

type GanttRow =
  | { type: "phase"; id: string; name: string }
  | { type: "item"; item: GanttItem };

function utcDay(iso: string): Date {
  const d = new Date(iso);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * MS_PER_DAY);
}

function dayIndex(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / MS_PER_DAY);
}

function isWeekend(d: Date): boolean {
  const day = d.getUTCDay();
  return day === 0 || day === 6;
}

function colWidth(scale: GanttScale): number {
  if (scale === "week") return 48;
  if (scale === "month") return 72;
  return 28;
}

function workdaysLabel(n: number): string {
  return n === 1 ? "1 day" : `${n} days`;
}

export function ScheduleGantt({
  rows,
  scale,
  criticalPath,
  scrollToToday,
  jobId,
  scheduleId,
  jobName,
  existingItems,
  phases,
  staff,
}: {
  rows: readonly GanttRow[];
  scale: GanttScale;
  criticalPath: boolean;
  scrollToToday?: boolean;
  jobId: string;
  scheduleId: string;
  jobName: string;
  existingItems: readonly ScheduleItemOption[];
  phases: readonly PhaseOption[];
  staff: readonly StaffOption[];
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [compact, setCompact] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);

  const items = useMemo(() => rows.filter((r): r is { type: "item"; item: GanttItem } => r.type === "item").map((r) => r.item), [rows]);

  const visualIndexById = useMemo(() => {
    const map = new Map<string, number>();
    let idx = 0;
    for (const r of rows) {
      if (r.type === "item") map.set(r.item.id, idx);
      idx += 1;
    }
    return map;
  }, [rows]);

  const { rangeStart, totalDays, todayOffset } = useMemo(() => {
    if (items.length === 0) {
      const today = utcDay(new Date().toISOString());
      return { rangeStart: today, totalDays: 30, todayOffset: 0 };
    }
    const starts = items.map((i) => utcDay(i.startDate).getTime());
    const ends = items.map((i) => utcDay(i.endDate).getTime());
    for (const i of items) {
      if (i.baselineStart) starts.push(utcDay(i.baselineStart).getTime());
      if (i.baselineEnd) ends.push(utcDay(i.baselineEnd).getTime());
    }
    const today = utcDay(new Date().toISOString());
    // Include today so the BT today marker stays on the date axis even before first task.
    const min = Math.min(...starts, today.getTime());
    const max = Math.max(...ends, today.getTime());
    const start = addDays(new Date(min), -3);
    const end = addDays(new Date(max), 7);
    const days = Math.max(14, dayIndex(start, end) + 1);
    return { rangeStart: start, totalDays: days, todayOffset: dayIndex(start, today) };
  }, [items]);

  const px = colWidth(scale);
  const timelineWidth = totalDays * px;

  const monthBands = useMemo(() => {
    const bands: { key: string; label: string; start: number; span: number }[] = [];
    let i = 0;
    while (i < totalDays) {
      const d = addDays(rangeStart, i);
      const label = d.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
      let span = 1;
      while (i + span < totalDays) {
        const n = addDays(rangeStart, i + span);
        if (n.getUTCMonth() !== d.getUTCMonth() || n.getUTCFullYear() !== d.getUTCFullYear()) break;
        span += 1;
      }
      bands.push({ key: `${d.getUTCFullYear()}-${d.getUTCMonth()}`, label, start: i, span });
      i += span;
    }
    return bands;
  }, [rangeStart, totalDays]);

  useEffect(() => {
    if (!scrollToToday || !scrollRef.current) return;
    const left = Math.max(0, todayOffset * px - scrollRef.current.clientWidth / 3);
    scrollRef.current.scrollTo({ left, behavior: "smooth" });
  }, [scrollToToday, todayOffset, px]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && fullscreen) setFullscreen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [fullscreen]);

  useEffect(() => {
    function onExpand() {
      setCompact((c) => !c);
    }
    function onFs() {
      setFullscreen((f) => !f);
    }
    function onExport() {
      window.print();
    }
    window.addEventListener("wci-schedule-expand-columns", onExpand);
    window.addEventListener("wci-schedule-fullscreen", onFs);
    window.addEventListener("wci-schedule-export", onExport);
    return () => {
      window.removeEventListener("wci-schedule-expand-columns", onExpand);
      window.removeEventListener("wci-schedule-fullscreen", onFs);
      window.removeEventListener("wci-schedule-export", onExport);
    };
  }, []);

  const titleW = compact ? 140 : 220;
  const startW = compact ? 0 : 100;
  const workW = compact ? 0 : 88;
  const actionsW = 64;
  const leftW = titleW + startW + workW + actionsW;

  const itemById = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);

  const shellClass = fullscreen
    ? "fixed inset-0 z-50 flex flex-col bg-[var(--bt-panel-bg)] p-3"
    : "flex flex-col overflow-hidden rounded-lg border bg-[var(--bt-panel-bg)]";

  const newItemProps = { jobId, scheduleId, jobName, existingItems, phases, staff };

  return (
    <div className={shellClass} style={{ borderColor: "var(--bt-border)" }} data-job={jobId}>
      {fullscreen ? (
        <div className="mb-2 flex justify-end">
          <button
            type="button"
            className="rounded border px-3 py-1.5 text-sm font-medium"
            style={{ borderColor: "var(--bt-border)" }}
            onClick={() => setFullscreen(false)}
          >
            Exit fullscreen
          </button>
        </div>
      ) : null}

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <div className="shrink-0 border-r" style={{ width: leftW, borderColor: "var(--bt-border)" }}>
          {/* Two-row header locks to timeline month (h-6) + day (h-8) axis — BT alignment. */}
          <div className="h-6 border-b" style={{ borderColor: "var(--bt-border)", background: "var(--bt-panel-bg-muted)" }} aria-hidden />
          <div
            className="flex h-8 items-center border-b text-[11px] font-semibold uppercase tracking-wide text-[var(--bt-muted)]"
            style={{ borderColor: "var(--bt-border)" }}
            data-testid="gantt-column-headers"
          >
            <div className="px-3" style={{ width: titleW }}>
              Title
            </div>
            {startW > 0 ? (
              <div className="px-2" style={{ width: startW }}>
                Start
              </div>
            ) : null}
            {workW > 0 ? (
              <div className="flex items-center gap-1 px-2" style={{ width: workW }}>
                Workdays
                <NewScheduleItemButton
                  {...newItemProps}
                  aria-label="Add schedule item"
                  className="inline-flex text-[var(--bt-primary)]"
                  style={{ background: "transparent", padding: 0, height: "auto" }}
                >
                  <PlusIcon className="h-3.5 w-3.5" />
                </NewScheduleItemButton>
              </div>
            ) : null}
            <div style={{ width: actionsW }} />
          </div>

          {rows.map((row) => {
            if (row.type === "phase") {
              return (
                <div
                  key={`phase-${row.id}`}
                  className="flex h-10 items-center justify-between border-b px-3 text-[11px] font-semibold uppercase tracking-wide text-[var(--bt-text)]"
                  style={{ borderColor: "var(--bt-border)", background: "var(--bt-panel-bg-muted)", width: leftW }}
                >
                  <span className="truncate">{row.name}</span>
                  {row.id !== "none" ? (
                    <form action={deletePhaseAction}>
                      <input type="hidden" name="jobId" value={jobId} />
                      <input type="hidden" name="phaseId" value={row.id} />
                      <button type="submit" className="text-[10px] font-medium normal-case text-[var(--bt-muted)] hover:text-red-600 hover:underline" title="Tasks in the phase are kept and ungrouped">
                        Delete
                      </button>
                    </form>
                  ) : null}
                </div>
              );
            }
            const item = row.item;
            return (
              <div
                key={item.id}
                className="group flex h-10 items-center border-b text-sm hover:bg-[var(--bt-panel-bg-muted)]"
                style={{ borderColor: "var(--bt-border)" }}
              >
                <div className="truncate px-3 font-medium text-[var(--bt-text)]" style={{ width: titleW }} title={item.title}>
                  {item.title}
                </div>
                {startW > 0 ? (
                  <div className="truncate px-2 text-xs text-[var(--bt-muted)]" style={{ width: startW }}>
                    {formatDateUtc(utcDay(item.startDate))}
                  </div>
                ) : null}
                {workW > 0 ? (
                  <div className="truncate px-2 text-xs text-[var(--bt-muted)]" style={{ width: workW }}>
                    {workdaysLabel(item.durationDays)}
                  </div>
                ) : null}
                <div className="flex items-center justify-end gap-0.5 px-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100" style={{ width: actionsW }}>
                  <EditScheduleItemButton
                    {...newItemProps}
                    initial={item.formValues}
                    className="inline-flex h-7 w-7 items-center justify-center rounded text-[var(--bt-primary)] hover:bg-[color-mix(in_srgb,var(--bt-primary)_12%,transparent)]"
                  >
                    <PencilIcon className="h-3.5 w-3.5" />
                  </EditScheduleItemButton>
                  <NewScheduleItemButton
                    {...newItemProps}
                    aria-label="Add schedule item"
                    className="inline-flex h-7 w-7 items-center justify-center rounded text-[var(--bt-primary)] hover:bg-[color-mix(in_srgb,var(--bt-primary)_12%,transparent)]"
                    style={{ background: "transparent" }}
                  >
                    <PlusCircleIcon className="h-3.5 w-3.5" />
                  </NewScheduleItemButton>
                </div>
              </div>
            );
          })}
        </div>

        <div ref={scrollRef} className="min-w-0 flex-1 overflow-x-auto overflow-y-hidden">
          <div style={{ width: timelineWidth, minWidth: "100%" }}>
            <div
              className="flex h-6 border-b text-[11px] font-semibold text-[var(--bt-text)]"
              style={{ borderColor: "var(--bt-border)", background: "var(--bt-panel-bg-muted)" }}
              data-testid="gantt-month-axis"
            >
              {monthBands.map((band) => (
                <div
                  key={band.key}
                  className="flex items-center truncate border-r px-2"
                  style={{ width: band.span * px, borderColor: "var(--bt-border)" }}
                >
                  {band.label}
                </div>
              ))}
            </div>
            <div
              className="relative flex h-8 border-b"
              style={{ borderColor: "var(--bt-border)" }}
              data-testid="gantt-day-axis"
              aria-label="Schedule date axis"
            >
              {Array.from({ length: totalDays }, (_, i) => {
                const d = addDays(rangeStart, i);
                const weekend = isWeekend(d);
                return (
                  <div
                    key={i}
                    className="flex flex-col items-center justify-center border-r text-[10px] leading-tight"
                    style={{
                      width: px,
                      borderColor: "var(--bt-border)",
                      background: weekend ? "color-mix(in srgb, var(--bt-primary) 6%, #f3f4f6)" : undefined,
                      color: "var(--bt-muted)",
                    }}
                  >
                    {scale === "day" ? (
                      <>
                        <span className="font-semibold text-[var(--bt-text)]">{d.getUTCDate()}</span>
                        <span>{DAY_ABBR[d.getUTCDay()]}</span>
                      </>
                    ) : scale === "week" ? (
                      <span className="font-semibold text-[var(--bt-text)]">{d.getUTCDate()}</span>
                    ) : (
                      <span className="font-semibold text-[var(--bt-text)]">
                        {d.getUTCDate() === 1 ? d.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" }) : d.getUTCDate()}
                      </span>
                    )}
                  </div>
                );
              })}
              {todayOffset >= 0 && todayOffset < totalDays ? (
                <div className="pointer-events-none absolute top-0 z-10" style={{ left: todayOffset * px + px / 2 - 5 }}>
                  <div className="h-2.5 w-2.5 rounded-full" style={{ background: "var(--bt-primary)" }} />
                </div>
              ) : null}
            </div>

            <div className="relative">
              <div className="pointer-events-none absolute inset-0 flex">
                {Array.from({ length: totalDays }, (_, i) => (
                  <div
                    key={i}
                    className="border-r"
                    style={{
                      width: px,
                      borderColor: "var(--bt-border)",
                      background: isWeekend(addDays(rangeStart, i)) ? "color-mix(in srgb, var(--bt-primary) 5%, transparent)" : undefined,
                    }}
                  />
                ))}
              </div>
              {todayOffset >= 0 && todayOffset < totalDays ? (
                <div
                  className="pointer-events-none absolute bottom-0 top-0 z-10 w-px"
                  style={{ left: todayOffset * px + px / 2, background: "var(--bt-primary)" }}
                />
              ) : null}

              <svg className="pointer-events-none absolute inset-0 z-[5] h-full w-full overflow-visible" aria-hidden>
                {items.flatMap((item) => {
                  const visualIdx = visualIndexById.get(item.id) ?? 0;
                  return item.predecessorIds.map((predId) => {
                    const pred = itemById.get(predId);
                    if (!pred) return null;
                    const predVisual = visualIndexById.get(pred.id);
                    if (predVisual === undefined) return null;
                    const predEnd = dayIndex(rangeStart, utcDay(pred.endDate)) + 1;
                    const itemStart = dayIndex(rangeStart, utcDay(item.startDate));
                    const x1 = predEnd * px;
                    const y1 = predVisual * 40 + 20;
                    const x2 = itemStart * px;
                    const y2 = visualIdx * 40 + 20;
                    const mid = x1 + Math.max(8, (x2 - x1) / 2);
                    return (
                      <path
                        key={`${predId}-${item.id}`}
                        d={`M ${x1} ${y1} H ${mid} V ${y2} H ${x2}`}
                        fill="none"
                        stroke="#9ca3af"
                        strokeWidth="1"
                      />
                    );
                  });
                })}
              </svg>

              {rows.map((row) => {
                if (row.type === "phase") {
                  return (
                    <div
                      key={`phase-bar-${row.id}`}
                      className="relative h-10 border-b"
                      style={{ borderColor: "var(--bt-border)", background: "var(--bt-panel-bg-muted)" }}
                    />
                  );
                }
                const item = row.item;
                const start = utcDay(item.startDate);
                const end = utcDay(item.endDate);
                const offset = dayIndex(rangeStart, start);
                const span = Math.max(1, dayIndex(start, end) + 1);
                const left = offset * px;
                const width = Math.max(px, span * px - 4);

                const barColor = criticalPath
                  ? item.isCriticalPath
                    ? "#2563EB"
                    : "#9ca3af"
                  : scheduleBarColor(item.displayColor);

                const labelInside = width > 72;
                const hasBaseline = Boolean(item.baselineStart && item.baselineEnd);
                const bStart = hasBaseline ? dayIndex(rangeStart, utcDay(item.baselineStart!)) : 0;
                const bSpan = hasBaseline ? Math.max(1, dayIndex(utcDay(item.baselineStart!), utcDay(item.baselineEnd!)) + 1) : 0;

                return (
                  <div key={item.id} className="relative h-10 border-b" style={{ borderColor: "var(--bt-border)" }}>
                    {hasBaseline ? (
                      <div
                        className="absolute top-1.5 h-1 rounded-full opacity-40"
                        style={{ left: bStart * px, width: Math.max(px, bSpan * px - 4), background: "var(--bt-muted)" }}
                        title="Baseline"
                      />
                    ) : null}
                    <div
                      className="absolute top-3 flex h-4 items-center overflow-hidden rounded-sm"
                      style={{
                        left,
                        width,
                        background: barColor,
                        boxShadow: criticalPath && item.isCriticalPath ? "0 0 0 1px #1d4ed8" : undefined,
                      }}
                      title={`${item.title}: ${formatDateUtc(start)} – ${formatDateUtc(end)}`}
                    >
                      {labelInside ? <span className="truncate px-1.5 text-[10px] font-medium text-white">{item.title}</span> : null}
                    </div>
                    {!labelInside ? (
                      <span className="absolute top-2.5 truncate text-[10px] text-[var(--bt-muted)]" style={{ left: left + width + 4, maxWidth: 140 }}>
                        {item.title}
                      </span>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
