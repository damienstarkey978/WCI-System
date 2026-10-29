"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";

import {
  ChevronDownIcon,
  ExpandColumnsIcon,
  FilterIcon,
  GearIcon,
  HistoryIcon,
  MaximizeIcon,
  UploadIcon,
} from "@/components/shell/icons";

import { dispatchScheduleChrome, type CalendarMode, type GanttScale, type ScheduleViewKey } from "./schedule-chrome";
import { ScheduleSwitch } from "./schedule-switch";

const VIEWS = [
  { key: "calendar", label: "Calendar" },
  { key: "list", label: "List" },
  { key: "gantt", label: "Gantt" },
] as const;

export type { CalendarMode, GanttScale, ScheduleViewKey };

function Menu({
  label,
  icon,
  children,
  align = "left",
}: {
  label: string;
  icon?: ReactNode;
  children: ReactNode;
  align?: "left" | "right";
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex h-9 items-center gap-1.5 rounded border bg-[var(--bt-panel-bg)] px-3 text-sm font-medium text-[var(--bt-text)] hover:bg-[var(--bt-panel-bg-muted)]"
        style={{ borderColor: "var(--bt-border)" }}
      >
        {icon}
        {label}
        <ChevronDownIcon className="h-3.5 w-3.5 text-[var(--bt-muted)]" />
      </button>
      {open ? (
        <div
          id={menuId}
          role="menu"
          className={`absolute z-30 mt-1 min-w-[11rem] rounded border bg-[var(--bt-panel-bg)] py-1 shadow-lg ${align === "right" ? "right-0" : "left-0"}`}
          style={{ borderColor: "var(--bt-border)" }}
          onClick={() => setOpen(false)}
        >
          {children}
        </div>
      ) : null}
    </div>
  );
}

function MenuItem({ children, onClick, disabled }: { children: ReactNode; onClick?: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={onClick}
      className="flex w-full px-3 py-2 text-left text-sm text-[var(--bt-text)] hover:bg-[var(--bt-panel-bg-muted)] disabled:cursor-not-allowed disabled:opacity-50"
    >
      {children}
    </button>
  );
}

function IconBtn({ label, onClick, children }: { label: string; onClick?: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="inline-flex h-9 w-9 items-center justify-center rounded border bg-[var(--bt-panel-bg)] text-[var(--bt-muted)] hover:bg-[var(--bt-panel-bg-muted)] hover:text-[var(--bt-text)]"
      style={{ borderColor: "var(--bt-border)" }}
    >
      {children}
    </button>
  );
}

function ToggleLink({ href, on, label }: { href: string; on: boolean; label: string }) {
  return (
    <Link href={href} className="inline-flex items-center gap-2 whitespace-nowrap text-sm font-medium text-[var(--bt-text)]" aria-pressed={on}>
      <span className="relative inline-block h-5 w-9 shrink-0 rounded-full" style={{ background: on ? "var(--bt-primary)" : "#d1d5db" }}>
        <span className="absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all" style={{ left: on ? "18px" : "2px" }} />
      </span>
      {label}
    </Link>
  );
}

function qs(params: Record<string, string | undefined | null | false>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v) sp.set(k, v);
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
}

export function ScheduleToolbar({
  jobId,
  scheduleId,
  view,
  criticalPath,
  phasesOn,
  isDraft,
  isOnline,
  ganttScale = "day",
  newItemSlot,
  phaseSlot,
  calendarMode,
}: {
  jobId: string;
  scheduleId: string;
  view: ScheduleViewKey;
  criticalPath: boolean;
  phasesOn: boolean;
  isDraft: boolean;
  isOnline: boolean;
  ganttScale?: GanttScale;
  newItemSlot: ReactNode;
  phaseSlot?: ReactNode;
  calendarMode?: CalendarMode;
}) {
  const base = `/jobs/${jobId}/schedule`;
  const viewQs = (next: ScheduleViewKey, extra: Record<string, string | undefined | null | false> = {}) =>
    `${base}${qs({
      view: next,
      critical: criticalPath ? "1" : undefined,
      phases: phasesOn ? "1" : undefined,
      scale: next === "gantt" && ganttScale !== "day" ? ganttScale : undefined,
      cal: next === "calendar" && calendarMode && calendarMode !== "month" ? calendarMode : undefined,
      ...extra,
    })}`;

  return (
    <div className="flex flex-col gap-2">
      {/* Row 1 — BT primary toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex overflow-hidden rounded border" style={{ borderColor: "var(--bt-border)" }} role="tablist" aria-label="Schedule view">
          {VIEWS.map((v) => {
            const active = v.key === view;
            return (
              <Link
                key={v.key}
                href={viewQs(v.key)}
                role="tab"
                aria-selected={active}
                className="px-3 py-1.5 text-sm font-medium"
                style={
                  active
                    ? { color: "var(--bt-primary)", boxShadow: "inset 0 -2px 0 var(--bt-primary)", background: "color-mix(in srgb, var(--bt-primary) 6%, transparent)" }
                    : { color: "var(--bt-muted)" }
                }
              >
                {v.label}
              </Link>
            );
          })}
        </div>

        <IconBtn label="Schedule settings">
          <GearIcon className="h-4 w-4" />
        </IconBtn>
        <IconBtn label="Schedule history">
          <HistoryIcon className="h-4 w-4" />
        </IconBtn>

        <div className="hidden items-center gap-3 sm:flex">
          <ScheduleSwitch
            jobId={jobId}
            scheduleId={scheduleId}
            field="isDraft"
            on={isDraft}
            label="Draft mode"
            title="While on, the schedule is hidden from clients and subs."
          />
          <ScheduleSwitch
            jobId={jobId}
            scheduleId={scheduleId}
            field="isOnline"
            on={!isOnline}
            invert
            label="Schedule Offline"
            title="When on, the schedule is unavailable to subs and clients. Notifications will not be sent."
          />
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Menu label="More Actions" align="right">
            <MenuItem disabled>Print</MenuItem>
            <MenuItem onClick={() => dispatchScheduleChrome("export")}>Export PDF</MenuItem>
            <MenuItem disabled>Duplicate items…</MenuItem>
            <MenuItem disabled>Shift schedule…</MenuItem>
          </Menu>
          <Menu label="Filter" icon={<FilterIcon className="h-3.5 w-3.5" />} align="right">
            <MenuItem disabled>Assigned to me</MenuItem>
            <MenuItem disabled>Unconfirmed</MenuItem>
            <MenuItem disabled>Critical path only</MenuItem>
            <div className="border-t px-3 py-2 text-xs text-[var(--bt-muted)]" style={{ borderColor: "var(--bt-border)" }}>
              Filters apply once wired to the schedule query.
            </div>
          </Menu>
          {newItemSlot}
        </div>
      </div>

      {/* Mobile-only draft/offline — keep chrome usable on narrow screens */}
      <div className="flex flex-wrap items-center gap-3 sm:hidden">
        <ScheduleSwitch
          jobId={jobId}
          scheduleId={scheduleId}
          field="isDraft"
          on={isDraft}
          label="Draft mode"
          title="While on, the schedule is hidden from clients and subs."
        />
        <ScheduleSwitch
          jobId={jobId}
          scheduleId={scheduleId}
          field="isOnline"
          on={!isOnline}
          invert
          label="Schedule Offline"
          title="When on, the schedule is unavailable to subs and clients. Notifications will not be sent."
        />
      </div>

      {/* Row 2 — view-specific sub-toolbar (BT Gantt / Calendar) */}
      {view === "gantt" ? (
        <div className="flex flex-wrap items-center gap-2 border-t pt-2" style={{ borderColor: "var(--bt-border)" }}>
          <div className="relative">
            <details className="group">
              <summary className="inline-flex h-9 list-none cursor-pointer items-center gap-1.5 rounded border bg-[var(--bt-panel-bg)] px-3 text-sm font-medium text-[var(--bt-text)] hover:bg-[var(--bt-panel-bg-muted)] [&::-webkit-details-marker]:hidden" style={{ borderColor: "var(--bt-border)" }}>
                {ganttScale === "day" ? "Day" : ganttScale === "week" ? "Week" : "Month"}
                <ChevronDownIcon className="h-3.5 w-3.5 text-[var(--bt-muted)]" />
              </summary>
              <div className="absolute z-30 mt-1 min-w-[7rem] rounded border bg-[var(--bt-panel-bg)] py-1 shadow-lg" style={{ borderColor: "var(--bt-border)" }}>
                <Link href={viewQs("gantt", { scale: undefined })} className="block px-3 py-2 text-sm hover:bg-[var(--bt-panel-bg-muted)]">
                  Day
                </Link>
                <Link href={viewQs("gantt", { scale: "week" })} className="block px-3 py-2 text-sm hover:bg-[var(--bt-panel-bg-muted)]">
                  Week
                </Link>
                <Link href={viewQs("gantt", { scale: "month" })} className="block px-3 py-2 text-sm hover:bg-[var(--bt-panel-bg-muted)]">
                  Month
                </Link>
              </div>
            </details>
          </div>
          <Link
            href={viewQs("gantt", { today: "1" })}
            className="inline-flex h-9 items-center rounded border bg-[var(--bt-panel-bg)] px-3 text-sm font-medium text-[var(--bt-text)] hover:bg-[var(--bt-panel-bg-muted)]"
            style={{ borderColor: "var(--bt-border)" }}
          >
            Today
          </Link>

          <div className="ml-auto flex flex-wrap items-center gap-3">
            <ToggleLink href={viewQs("gantt", { phases: phasesOn ? undefined : "1" })} on={phasesOn} label="Phases" />
            {phasesOn && phaseSlot ? phaseSlot : null}
            <ToggleLink href={viewQs("gantt", { critical: criticalPath ? undefined : "1" })} on={criticalPath} label="Critical Path" />
            <div className="flex items-center gap-1">
              <IconBtn label="Expand columns" onClick={() => dispatchScheduleChrome("expand-columns")}>
                <ExpandColumnsIcon className="h-4 w-4" />
              </IconBtn>
              <IconBtn label="Export" onClick={() => dispatchScheduleChrome("export")}>
                <UploadIcon className="h-4 w-4" />
              </IconBtn>
              <IconBtn label="Fullscreen" onClick={() => dispatchScheduleChrome("fullscreen")}>
                <MaximizeIcon className="h-4 w-4" />
              </IconBtn>
            </div>
          </div>
        </div>
      ) : null}

      {view === "list" ? (
        <div className="flex flex-wrap items-center gap-3 border-t pt-2" style={{ borderColor: "var(--bt-border)" }}>
          <ToggleLink href={viewQs("list", { phases: phasesOn ? undefined : "1" })} on={phasesOn} label="Phases" />
          {phasesOn && phaseSlot ? phaseSlot : null}
          <ToggleLink href={viewQs("list", { critical: criticalPath ? undefined : "1" })} on={criticalPath} label="Critical Path" />
        </div>
      ) : null}

      {view === "calendar" ? (
        <div className="flex flex-wrap items-center gap-2 border-t pt-2" style={{ borderColor: "var(--bt-border)" }}>
          <div className="inline-flex overflow-hidden rounded border" style={{ borderColor: "var(--bt-border)" }}>
            {(
              [
                ["month", "Month"],
                ["week", "Week"],
                ["day", "Day"],
                ["agenda", "Agenda"],
              ] as const
            ).map(([key, label]) => {
              const active = (calendarMode ?? "month") === key;
              return (
                <Link
                  key={key}
                  href={viewQs("calendar", { cal: key === "month" ? undefined : key })}
                  className="px-3 py-1.5 text-sm font-medium"
                  style={active ? { color: "var(--bt-primary)", background: "color-mix(in srgb, var(--bt-primary) 6%, transparent)" } : { color: "var(--bt-muted)" }}
                >
                  {label}
                </Link>
              );
            })}
          </div>
          <Link
            href={viewQs("calendar", { month: new Date().toISOString().slice(0, 7), cal: calendarMode && calendarMode !== "month" ? calendarMode : undefined })}
            className="inline-flex h-9 items-center rounded border bg-[var(--bt-panel-bg)] px-3 text-sm font-medium text-[var(--bt-text)] hover:bg-[var(--bt-panel-bg-muted)]"
            style={{ borderColor: "var(--bt-border)" }}
          >
            Today
          </Link>
          <div className="ml-auto">
            <ToggleLink href={viewQs("calendar", { critical: criticalPath ? undefined : "1" })} on={criticalPath} label="Critical Path" />
          </div>
        </div>
      ) : null}
    </div>
  );
}
