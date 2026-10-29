"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition, type PointerEvent as ReactPointerEvent } from "react";
import { useRouter } from "next/navigation";

import { PencilIcon, PlusCircleIcon, PlusIcon } from "@/components/shell/icons";
import { formatDateUtc } from "@/lib/format";

import { deletePhaseAction, saveGanttMovesAction } from "./actions";
import type { GanttScale } from "./schedule-chrome";
import { scheduleBarColor } from "./schedule-colors";
import type { PhaseOption, ScheduleItemFormValues, ScheduleItemOption, StaffOption } from "./schedule-item-form";
import { EditScheduleItemButton, NewScheduleItemButton } from "./schedule-item-modals";

const MS_PER_DAY = 86_400_000;
const DAY_ABBR = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"] as const;
const ROW_H = 40;

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
  readonly assigneeUserIds: readonly string[];
  readonly percentComplete: number;
  readonly formValues: ScheduleItemFormValues & { id: string };
}

type GanttRow =
  | { type: "phase"; id: string; name: string }
  | { type: "item"; item: GanttItem };

type DayShiftMap = Record<string, number>;

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

function toIsoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function shiftedItem(item: GanttItem, shiftDays: number): { start: Date; end: Date } {
  const start = addDays(utcDay(item.startDate), shiftDays);
  const end = addDays(utcDay(item.endDate), shiftDays);
  return { start, end };
}

function assigneeLabel(ids: readonly string[], staff: readonly StaffOption[]): string {
  if (ids.length === 0) return "—";
  const names = ids.map((id) => staff.find((s) => s.id === id)?.name ?? id);
  return names.join(", ");
}

function UndoIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className} aria-hidden>
      <path d="M4 10a6 6 0 1 0 1.8-4.3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M4 3.5V7h3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function RedoIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className} aria-hidden>
      <path d="M16 10a6 6 0 1 1-1.8-4.3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M16 3.5V7h-3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * Buildertrend Gantt interaction: hover popover, locked dependency links with
 * end/start nodes, Draft-mode drag moves, and bottom Undo/Discard/Save bar that
 * re-locks on Save.
 */
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
  unlocked = false,
  onPersistMoves,
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
  /** Draft mode ON ⇒ unlocked (bars are draggable). */
  unlocked?: boolean;
  /**
   * Optional override for Save (parity fixture). Must persist moves and re-lock.
   * When omitted, uses saveGanttMovesAction (clears preds, sets manualStartDate, isDraft=false).
   */
  onPersistMoves?: (moves: readonly { itemId: string; startDate: string }[]) => Promise<{ error?: string } | void>;
}) {
  const router = useRouter();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [compact, setCompact] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [shifts, setShifts] = useState<DayShiftMap>({});
  const [undoStack, setUndoStack] = useState<DayShiftMap[]>([]);
  const [redoStack, setRedoStack] = useState<DayShiftMap[]>([]);
  const [drag, setDrag] = useState<{ id: string; originX: number; originShift: number } | null>(null);
  const [pending, startTransition] = useTransition();
  const [saveError, setSaveError] = useState<string | null>(null);

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

  const dirty = useMemo(() => Object.values(shifts).some((n) => n !== 0), [shifts]);

  const { rangeStart, totalDays, todayOffset } = useMemo(() => {
    if (items.length === 0) {
      const today = utcDay(new Date().toISOString());
      return { rangeStart: today, totalDays: 30, todayOffset: 0 };
    }
    const starts: number[] = [];
    const ends: number[] = [];
    for (const i of items) {
      const shift = shifts[i.id] ?? 0;
      const { start, end } = shiftedItem(i, shift);
      starts.push(start.getTime());
      ends.push(end.getTime());
      if (i.baselineStart) starts.push(utcDay(i.baselineStart).getTime());
      if (i.baselineEnd) ends.push(utcDay(i.baselineEnd).getTime());
    }
    const today = utcDay(new Date().toISOString());
    const min = Math.min(...starts, today.getTime());
    const max = Math.max(...ends, today.getTime());
    const start = addDays(new Date(min), -3);
    const end = addDays(new Date(max), 7);
    const days = Math.max(14, dayIndex(start, end) + 1);
    return { rangeStart: start, totalDays: days, todayOffset: dayIndex(start, today) };
  }, [items, shifts]);

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

  // Leaving draft/unlocked clears local drag state (adjust during render — React docs).
  const [unlockedSeen, setUnlockedSeen] = useState(unlocked);
  if (unlockedSeen !== unlocked) {
    setUnlockedSeen(unlocked);
    if (!unlocked) {
      setShifts({});
      setUndoStack([]);
      setRedoStack([]);
      setDrag(null);
      setSaveError(null);
    }
  }

  const onUndo = useCallback(() => {
    setUndoStack((stack) => {
      if (stack.length === 0) return stack;
      const prev = stack[stack.length - 1]!;
      setRedoStack((redo) => [...redo, shifts]);
      setShifts(prev);
      return stack.slice(0, -1);
    });
  }, [shifts]);

  const onRedo = useCallback(() => {
    setRedoStack((stack) => {
      if (stack.length === 0) return stack;
      const next = stack[stack.length - 1]!;
      setUndoStack((undo) => [...undo, shifts]);
      setShifts(next);
      return stack.slice(0, -1);
    });
  }, [shifts]);

  const onDiscard = useCallback(() => {
    setShifts({});
    setUndoStack([]);
    setRedoStack([]);
    setSaveError(null);
  }, []);

  const onSave = useCallback(() => {
    const moves = items
      .map((item) => {
        const shift = shifts[item.id] ?? 0;
        if (shift === 0) return null;
        const { start } = shiftedItem(item, shift);
        return { itemId: item.id, startDate: toIsoDay(start) };
      })
      .filter((m): m is { itemId: string; startDate: string } => m !== null);

    setSaveError(null);
    startTransition(async () => {
      const result = onPersistMoves
        ? await onPersistMoves(moves)
        : await saveGanttMovesAction({ jobId, scheduleId, moves, relock: true });
      if (result && "error" in result && result.error) {
        setSaveError(result.error);
        return;
      }
      setShifts({});
      setUndoStack([]);
      setRedoStack([]);
      if (!onPersistMoves) router.refresh();
    });
  }, [items, shifts, jobId, scheduleId, router, onPersistMoves]);

  const onBarPointerDown = useCallback(
    (e: ReactPointerEvent, itemId: string) => {
      if (!unlocked) return;
      e.preventDefault();
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      setHoverId(null);
      setDrag({ id: itemId, originX: e.clientX, originShift: shifts[itemId] ?? 0 });
    },
    [unlocked, shifts],
  );

  const onBarPointerMove = useCallback(
    (e: ReactPointerEvent) => {
      if (!drag) return;
      const deltaDays = Math.round((e.clientX - drag.originX) / px);
      setShifts((prev) => ({ ...prev, [drag.id]: drag.originShift + deltaDays }));
    },
    [drag, px],
  );

  const onBarPointerUp = useCallback(() => {
    if (!drag) return;
    const finalShift = shifts[drag.id] ?? 0;
    if (finalShift !== drag.originShift) {
      setUndoStack((stack) => [...stack, { ...shifts, [drag.id]: drag.originShift }]);
      setRedoStack([]);
    }
    setDrag(null);
  }, [drag, shifts]);

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
  const locked = !unlocked;

  const hoverItem = hoverId ? itemById.get(hoverId) : null;
  const hoverShift = hoverItem ? shifts[hoverItem.id] ?? 0 : 0;
  const hoverDates = hoverItem ? shiftedItem(hoverItem, hoverShift) : null;
  const hoverVisual = hoverItem ? visualIndexById.get(hoverItem.id) : undefined;
  const hoverBarLeft = hoverDates ? dayIndex(rangeStart, hoverDates.start) * px : 0;

  return (
    <div className={shellClass} style={{ borderColor: "var(--bt-border)" }} data-job={jobId} data-schedule-locked={locked ? "1" : "0"}>
      {fullscreen ? (
        <div className="mb-2 flex justify-end">
          <button type="button" className="rounded border px-3 py-1.5 text-sm font-medium" style={{ borderColor: "var(--bt-border)" }} onClick={() => setFullscreen(false)}>
            Exit fullscreen
          </button>
        </div>
      ) : null}

      {unlocked ? (
        <p className="border-b px-3 py-1.5 text-xs text-[var(--bt-muted)]" style={{ borderColor: "var(--bt-border)", background: "color-mix(in srgb, var(--bt-primary) 6%, transparent)" }}>
          Draft mode — schedule unlocked. Drag bars to move dates, then Save to lock again.
        </p>
      ) : null}

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <div className="shrink-0 border-r" style={{ width: leftW, borderColor: "var(--bt-border)" }}>
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
            const shift = shifts[item.id] ?? 0;
            const { start } = shiftedItem(item, shift);
            const highlighted = hoverId === item.id || drag?.id === item.id;
            return (
              <div
                key={item.id}
                className="group flex h-10 items-center border-b text-sm"
                style={{
                  borderColor: "var(--bt-border)",
                  background: highlighted ? "color-mix(in srgb, var(--bt-primary) 10%, transparent)" : undefined,
                }}
                onMouseEnter={() => !drag && setHoverId(item.id)}
                onMouseLeave={() => setHoverId((id) => (id === item.id ? null : id))}
              >
                <div className="truncate px-3 font-medium text-[var(--bt-text)]" style={{ width: titleW }} title={item.title}>
                  {item.title}
                </div>
                {startW > 0 ? (
                  <div className="truncate px-2 text-xs text-[var(--bt-muted)]" style={{ width: startW }}>
                    {formatDateUtc(start)}
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

        <div ref={scrollRef} className="relative min-w-0 flex-1 overflow-x-auto overflow-y-hidden">
          <div style={{ width: timelineWidth, minWidth: "100%" }}>
            <div
              className="flex h-6 border-b text-[11px] font-semibold text-[var(--bt-text)]"
              style={{ borderColor: "var(--bt-border)", background: "var(--bt-panel-bg-muted)" }}
              data-testid="gantt-month-axis"
            >
              {monthBands.map((band) => (
                <div key={band.key} className="flex items-center truncate border-r px-2" style={{ width: band.span * px, borderColor: "var(--bt-border)" }}>
                  {band.label}
                </div>
              ))}
            </div>
            <div className="relative flex h-8 border-b" style={{ borderColor: "var(--bt-border)" }} data-testid="gantt-day-axis" aria-label="Schedule date axis">
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
                <div className="pointer-events-none absolute bottom-0 top-0 z-10 w-px" style={{ left: todayOffset * px + px / 2, background: "var(--bt-primary)" }} />
              ) : null}

              {/* Locked dependency links with BT-style end/start nodes */}
              <svg className="pointer-events-none absolute inset-0 z-[5] h-full w-full overflow-visible" aria-hidden data-testid="gantt-dependency-links">
                {items.flatMap((item) => {
                  const visualIdx = visualIndexById.get(item.id) ?? 0;
                  const itemShift = shifts[item.id] ?? 0;
                  const itemDates = shiftedItem(item, itemShift);
                  return item.predecessorIds.map((predId) => {
                    const pred = itemById.get(predId);
                    if (!pred) return null;
                    const predVisual = visualIndexById.get(pred.id);
                    if (predVisual === undefined) return null;
                    const predShift = shifts[pred.id] ?? 0;
                    const predDates = shiftedItem(pred, predShift);
                    const x1 = (dayIndex(rangeStart, predDates.end) + 1) * px;
                    const y1 = predVisual * ROW_H + ROW_H / 2;
                    const x2 = dayIndex(rangeStart, itemDates.start) * px;
                    const y2 = visualIdx * ROW_H + ROW_H / 2;
                    const mid = x1 + Math.max(10, (x2 - x1) / 2);
                    return (
                      <g key={`${predId}-${item.id}`}>
                        <path d={`M ${x1} ${y1} H ${mid} V ${y2} H ${x2}`} fill="none" stroke="#6b7280" strokeWidth="1.25" />
                        <circle cx={x1} cy={y1} r="3.5" fill="#fff" stroke="#6b7280" strokeWidth="1.25" />
                        <circle cx={x2} cy={y2} r="3.5" fill="#fff" stroke="#6b7280" strokeWidth="1.25" />
                      </g>
                    );
                  });
                })}
              </svg>

              {rows.map((row) => {
                if (row.type === "phase") {
                  return (
                    <div key={`phase-bar-${row.id}`} className="relative h-10 border-b" style={{ borderColor: "var(--bt-border)", background: "var(--bt-panel-bg-muted)" }} />
                  );
                }
                const item = row.item;
                const shift = shifts[item.id] ?? 0;
                const { start, end } = shiftedItem(item, shift);
                const offset = dayIndex(rangeStart, start);
                const span = Math.max(1, dayIndex(start, end) + 1);
                const left = offset * px;
                const width = Math.max(px, span * px - 4);
                const barColor = criticalPath ? (item.isCriticalPath ? "#2563EB" : "#9ca3af") : scheduleBarColor(item.displayColor);
                const labelInside = width > 72;
                const hasBaseline = Boolean(item.baselineStart && item.baselineEnd);
                const bStart = hasBaseline ? dayIndex(rangeStart, utcDay(item.baselineStart!)) : 0;
                const bSpan = hasBaseline ? Math.max(1, dayIndex(utcDay(item.baselineStart!), utcDay(item.baselineEnd!)) + 1) : 0;
                const isHover = hoverId === item.id || drag?.id === item.id;

                return (
                  <div
                    key={item.id}
                    className="relative h-10 border-b"
                    style={{ borderColor: "var(--bt-border)", background: isHover ? "color-mix(in srgb, var(--bt-primary) 6%, transparent)" : undefined }}
                    onMouseEnter={() => !drag && setHoverId(item.id)}
                    onMouseLeave={() => setHoverId((id) => (id === item.id ? null : id))}
                  >
                    {hasBaseline ? (
                      <div
                        className="absolute top-1.5 h-1 rounded-full opacity-40"
                        style={{ left: bStart * px, width: Math.max(px, bSpan * px - 4), background: "var(--bt-muted)" }}
                        title="Baseline"
                      />
                    ) : null}
                    <div
                      role="button"
                      tabIndex={0}
                      data-testid={`gantt-bar-${item.id}`}
                      data-gantt-bar={item.id}
                      aria-label={`${item.title} ${formatDateUtc(start)} to ${formatDateUtc(end)}`}
                      className={`absolute top-3 flex h-4 items-center overflow-visible rounded-sm ${unlocked ? "cursor-grab active:cursor-grabbing" : "cursor-default"}`}
                      style={{
                        left,
                        width,
                        background: barColor,
                        boxShadow: criticalPath && item.isCriticalPath ? "0 0 0 1px #1d4ed8" : undefined,
                        zIndex: isHover ? 8 : 6,
                        touchAction: unlocked ? "none" : undefined,
                      }}
                      onMouseEnter={() => !drag && setHoverId(item.id)}
                      onMouseLeave={() => setHoverId((id) => (id === item.id ? null : id))}
                      onPointerDown={(e) => onBarPointerDown(e, item.id)}
                      onPointerMove={onBarPointerMove}
                      onPointerUp={onBarPointerUp}
                      onPointerCancel={onBarPointerUp}
                    >
                      {labelInside ? <span className="truncate px-1.5 text-[10px] font-medium text-white pointer-events-none">{item.title}</span> : null}
                      {isHover ? (
                        <>
                          <span className="pointer-events-none absolute -left-1 top-1/2 h-2.5 w-2.5 -translate-y-1/2 rounded-full border border-[#6b7280] bg-white" />
                          <span className="pointer-events-none absolute -right-1 top-1/2 h-2.5 w-2.5 -translate-y-1/2 rounded-full border border-[#6b7280] bg-white" />
                        </>
                      ) : null}
                    </div>
                    {!labelInside ? (
                      <span className="pointer-events-none absolute top-2.5 truncate text-[10px] text-[var(--bt-muted)]" style={{ left: left + width + 6, maxWidth: 140 }}>
                        {item.title}
                      </span>
                    ) : null}
                  </div>
                );
              })}

              {hoverItem && hoverDates && hoverVisual !== undefined && !drag ? (
                <div
                  data-testid="gantt-hover-popover"
                  className="pointer-events-none absolute z-20 w-56 overflow-hidden rounded border bg-white shadow-lg"
                  style={{
                    borderColor: "var(--bt-border)",
                    left: Math.min(hoverBarLeft, Math.max(0, timelineWidth - 230)),
                    top: hoverVisual * ROW_H + ROW_H + 4,
                  }}
                >
                  <div className="truncate px-3 py-1.5 text-xs font-semibold text-white" style={{ background: scheduleBarColor(hoverItem.displayColor) }}>
                    {hoverItem.title}
                  </div>
                  <div className="space-y-1 px-3 py-2 text-xs text-[var(--bt-text)]">
                    <div>
                      {formatDateUtc(hoverDates.start)} - {formatDateUtc(hoverDates.end)}
                    </div>
                    <div>{hoverItem.percentComplete >= 100 ? "Completed" : "Not Completed"}</div>
                    <div>
                      <span className="font-semibold">Work Days</span> {workdaysLabel(hoverItem.durationDays)}
                    </div>
                    <div>
                      <span className="font-semibold">Assignees</span> {assigneeLabel(hoverItem.assigneeUserIds, staff)}
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      {unlocked ? (
        <div className="pointer-events-none fixed inset-x-0 bottom-4 z-40 flex justify-center px-3" data-testid="gantt-draft-bar">
          <div
            className="pointer-events-auto flex items-center gap-2 rounded-lg border bg-white px-3 py-2 shadow-lg"
            style={{ borderColor: "var(--bt-border)" }}
          >
            <button
              type="button"
              aria-label="Undo"
              title="Undo"
              disabled={undoStack.length === 0 || pending}
              onClick={onUndo}
              className="inline-flex h-8 w-8 items-center justify-center rounded text-[var(--bt-muted)] hover:bg-[var(--bt-panel-bg-muted)] disabled:opacity-40"
            >
              <UndoIcon className="h-4 w-4" />
            </button>
            <button
              type="button"
              aria-label="Redo"
              title="Redo"
              disabled={redoStack.length === 0 || pending}
              onClick={onRedo}
              className="inline-flex h-8 w-8 items-center justify-center rounded text-[var(--bt-muted)] hover:bg-[var(--bt-panel-bg-muted)] disabled:opacity-40"
            >
              <RedoIcon className="h-4 w-4" />
            </button>
            <div className="mx-1 h-5 w-px bg-[var(--bt-border)]" />
            <button
              type="button"
              disabled={pending}
              onClick={onDiscard}
              className="rounded px-3 py-1.5 text-sm font-medium text-[var(--bt-text)] hover:bg-[var(--bt-panel-bg-muted)] disabled:opacity-40"
            >
              Discard
            </button>
            <button
              type="button"
              disabled={pending || !dirty}
              onClick={onSave}
              className="rounded px-4 py-1.5 text-sm font-semibold text-[var(--bt-on-primary)] disabled:opacity-40"
              style={{ background: "var(--bt-primary)" }}
            >
              {pending ? "Saving…" : "Save"}
            </button>
            {saveError ? <span className="max-w-[12rem] truncate text-xs text-[var(--bt-danger)]">{saveError}</span> : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
