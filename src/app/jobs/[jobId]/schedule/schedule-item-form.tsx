"use client";

import { useActionState, useMemo, useState } from "react";

import { CloseIcon } from "@/components/shell/icons";

import { saveScheduleItemAction, type ActionState } from "./actions";

const INITIAL: ActionState = {};

const DISPLAY_COLORS = [
  { name: "Olive", hex: "#6B8E23" },
  { name: "Blue", hex: "#2563EB" },
  { name: "Teal", hex: "#0D9488" },
  { name: "Orange", hex: "#EA580C" },
  { name: "Purple", hex: "#7C3AED" },
  { name: "Red", hex: "#DC2626" },
  { name: "Gray", hex: "#6B7280" },
] as const;

const REMINDER_OPTIONS = [
  { label: "None", value: "" },
  { label: "1 Day Before", value: "1" },
  { label: "2 Days Before", value: "2" },
  { label: "3 Days Before", value: "3" },
  { label: "1 Week Before", value: "7" },
] as const;

const DETAIL_SUBTABS = [
  "Predecessors & Links",
  "Phases & Tags",
  "Viewing",
  "Notes",
  "Shifts",
  "Files",
  "RFIs",
] as const;

type DetailSubtab = (typeof DETAIL_SUBTABS)[number];
type MainTab = "details" | "related";
type NotesTab = "all" | "internal" | "subs" | "client";

export interface ScheduleItemOption {
  readonly id: string;
  readonly title: string;
}

export interface PhaseOption {
  readonly id: string;
  readonly name: string;
}

export interface StaffOption {
  readonly id: string;
  readonly name: string;
}

export interface ScheduleItemFormValues {
  readonly id?: string;
  readonly title: string;
  readonly displayColor: string | null;
  readonly assigneeUserIds: readonly string[];
  readonly startDate: string;
  readonly durationDays: number;
  readonly endDate: string;
  readonly isHourly: boolean;
  readonly percentComplete: number;
  readonly reminderDays: number | null;
  readonly predecessorIds: readonly string[];
  readonly lagDays: number;
  readonly phaseId: string | null;
  readonly tags: readonly string[];
  readonly showOnGantt: boolean;
  readonly clientVisible: boolean;
  readonly subVisible: boolean;
  readonly notesInternal: string;
  readonly notesSubs: string;
  readonly notesClient: string;
  readonly hasBaseline: boolean;
}

function isoToday(): string {
  return new Date().toISOString().slice(0, 10);
}

function addCalendarDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function daysBetween(startIso: string, endIso: string): number {
  const start = new Date(`${startIso}T00:00:00Z`).getTime();
  const end = new Date(`${endIso}T00:00:00Z`).getTime();
  return Math.max(1, Math.round((end - start) / 86_400_000) + 1);
}

export function defaultNewScheduleItemValues(): ScheduleItemFormValues {
  const start = isoToday();
  return {
    title: "",
    displayColor: "Olive",
    assigneeUserIds: [],
    startDate: start,
    durationDays: 1,
    endDate: start,
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
  };
}

export function ScheduleItemForm({
  jobId,
  scheduleId,
  jobName,
  existingItems,
  phases,
  staff,
  initial,
  onClose,
  showShiftsAndRfis = true,
}: {
  jobId: string;
  scheduleId: string;
  jobName: string;
  existingItems: readonly ScheduleItemOption[];
  phases: readonly PhaseOption[];
  staff: readonly StaffOption[];
  initial: ScheduleItemFormValues;
  onClose?: () => void;
  /** New items hide Shifts and RFIs, matching Buildertrend. */
  showShiftsAndRfis?: boolean;
}) {
  const [state, formAction, pending] = useActionState(saveScheduleItemAction, INITIAL);
  const [mainTab, setMainTab] = useState<MainTab>("details");
  const [subTab, setSubTab] = useState<DetailSubtab>("Predecessors & Links");
  const [notesTab, setNotesTab] = useState<NotesTab>("all");
  const [startDate, setStartDate] = useState(initial.startDate);
  const [durationDays, setDurationDays] = useState(initial.durationDays);
  const [endDate, setEndDate] = useState(initial.endDate);
  const [progress, setProgress] = useState(initial.percentComplete);
  const [complete, setComplete] = useState(initial.percentComplete >= 100);
  const [predecessors, setPredecessors] = useState<Array<{ id: string; lagDays: number }>>(
    initial.predecessorIds.length > 0
      ? initial.predecessorIds.map((id) => ({ id, lagDays: initial.lagDays }))
      : [{ id: "", lagDays: 0 }],
  );
  const [tagsText, setTagsText] = useState((initial.tags ?? []).join(", "));

  const otherItems = useMemo(
    () => existingItems.filter((item) => item.id !== initial.id),
    [existingItems, initial.id],
  );

  const visibleSubtabs = showShiftsAndRfis
    ? DETAIL_SUBTABS
    : DETAIL_SUBTABS.filter((tab) => tab !== "Shifts" && tab !== "RFIs");

  function onStartChange(value: string) {
    setStartDate(value);
    setEndDate(addCalendarDays(value, Math.max(1, durationDays) - 1));
  }

  function onDurationChange(value: number) {
    const days = Math.max(1, value || 1);
    setDurationDays(days);
    setEndDate(addCalendarDays(startDate, days - 1));
  }

  function onEndChange(value: string) {
    setEndDate(value);
    setDurationDays(daysBetween(startDate, value));
  }

  function onCompleteToggle(checked: boolean) {
    setComplete(checked);
    if (checked) setProgress(100);
  }

  return (
    <form action={formAction} className="flex flex-col">
      <input type="hidden" name="jobId" value={jobId} />
      <input type="hidden" name="scheduleId" value={scheduleId} />
      {initial.id ? <input type="hidden" name="itemId" value={initial.id} /> : null}

      <div className="flex items-start justify-between border-b px-4 py-3" style={{ borderColor: "var(--bt-border)" }}>
        <div>
          <p className="text-xs text-[var(--bt-muted)]">{jobName}</p>
          <h2 className="text-lg font-semibold text-[var(--bt-text)]">Schedule Item</h2>
        </div>
        {onClose ? (
          <button type="button" onClick={onClose} aria-label="Close" className="rounded p-1 text-[var(--bt-muted)] hover:bg-black/5">
            <CloseIcon className="h-4 w-4" />
          </button>
        ) : null}
      </div>

      <div className="flex gap-4 border-b px-4" style={{ borderColor: "var(--bt-border)" }}>
        {(
          [
            ["details", "Schedule Item Details"],
            ["related", "Related Items"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setMainTab(key)}
            className="-mb-px border-b-2 px-1 py-2.5 text-sm font-medium"
            style={{
              borderColor: mainTab === key ? "var(--bt-primary)" : "transparent",
              color: mainTab === key ? "var(--bt-primary)" : "var(--bt-muted)",
            }}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-4 px-4 py-4">
        <div className={mainTab === "details" ? "flex flex-col gap-4" : "hidden"}>
            <label className="flex items-center gap-2 text-sm text-[var(--bt-text)]">
              <input
                type="checkbox"
                checked={complete}
                onChange={(e) => onCompleteToggle(e.target.checked)}
                className="h-4 w-4"
              />
              Complete
            </label>
            <input type="hidden" name="complete" value={complete ? "on" : ""} />

            <div className="grid gap-3 sm:grid-cols-[1fr_180px]">
              <label className="grid gap-1 text-sm">
                <span className="text-xs font-medium text-[var(--bt-muted)]">
                  Title <span className="text-red-600">*</span>
                </span>
                <input
                  name="title"
                  required
                  defaultValue={initial.title}
                  className="rounded border px-3 py-2 text-sm outline-none focus:border-[var(--bt-primary)]"
                  style={{ borderColor: "var(--bt-border)" }}
                />
              </label>
              <label className="grid gap-1 text-sm">
                <span className="text-xs font-medium text-[var(--bt-muted)]">Display Color</span>
                <select
                  name="displayColor"
                  defaultValue={initial.displayColor ?? "Olive"}
                  className="rounded border px-3 py-2 text-sm outline-none focus:border-[var(--bt-primary)]"
                  style={{ borderColor: "var(--bt-border)" }}
                >
                  {DISPLAY_COLORS.map((color) => (
                    <option key={color.name} value={color.name}>
                      {color.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <label className="grid gap-1 text-sm">
              <span className="text-xs font-medium text-[var(--bt-muted)]">Assignees</span>
              <select
                name="assigneeUserIds"
                multiple
                defaultValue={[...initial.assigneeUserIds]}
                className="min-h-10 rounded border px-3 py-2 text-sm outline-none focus:border-[var(--bt-primary)]"
                style={{ borderColor: "var(--bt-border)" }}
              >
                {staff.map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.name}
                  </option>
                ))}
              </select>
              <span className="text-[11px] text-[var(--bt-muted)]">Hold Ctrl or Cmd to select more than one.</span>
            </label>

            <div className="grid gap-3 sm:grid-cols-3">
              <label className="grid gap-1 text-sm">
                <span className="text-xs font-medium text-[var(--bt-muted)]">
                  Start Date <span className="text-red-600">*</span>
                </span>
                <input
                  type="date"
                  name="manualStartDate"
                  required
                  value={startDate}
                  onChange={(e) => onStartChange(e.target.value)}
                  className="rounded border px-3 py-2 text-sm outline-none focus:border-[var(--bt-primary)]"
                  style={{ borderColor: "var(--bt-border)" }}
                />
              </label>
              <label className="grid gap-1 text-sm">
                <span className="text-xs font-medium text-[var(--bt-muted)]">
                  Work Days <span className="text-red-600">*</span>
                </span>
                <div className="relative">
                  <input
                    name="durationDays"
                    type="number"
                    min={1}
                    required
                    value={durationDays}
                    onChange={(e) => onDurationChange(Number(e.target.value))}
                    className="w-full rounded border px-3 py-2 pr-12 text-sm outline-none focus:border-[var(--bt-primary)]"
                    style={{ borderColor: "var(--bt-border)" }}
                  />
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[var(--bt-muted)]">days</span>
                </div>
              </label>
              <label className="grid gap-1 text-sm">
                <span className="text-xs font-medium text-[var(--bt-muted)]">
                  End Date <span className="text-red-600">*</span>
                </span>
                <input
                  type="date"
                  name="endDateDisplay"
                  required
                  value={endDate}
                  onChange={(e) => onEndChange(e.target.value)}
                  className="rounded border px-3 py-2 text-sm outline-none focus:border-[var(--bt-primary)]"
                  style={{ borderColor: "var(--bt-border)" }}
                />
              </label>
            </div>

            <label className="flex items-center gap-3 text-sm text-[var(--bt-text)]">
              <span className="text-xs font-medium text-[var(--bt-muted)]">Hourly</span>
              <span className="relative inline-flex h-5 w-9 items-center">
                <input type="checkbox" name="isHourly" defaultChecked={initial.isHourly} className="peer sr-only" />
                <span className="h-5 w-9 rounded-full bg-gray-300 peer-checked:bg-[var(--bt-primary)]" />
                <span className="absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white transition peer-checked:translate-x-4" />
              </span>
            </label>

            <div className="grid gap-1 text-sm">
              <span className="text-xs font-medium text-[var(--bt-muted)]">Progress</span>
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={progress}
                  onChange={(e) => {
                    const next = Number(e.target.value);
                    setProgress(next);
                    setComplete(next >= 100);
                  }}
                  className="flex-1"
                />
                <input
                  name="percent"
                  type="number"
                  min={0}
                  max={100}
                  value={progress}
                  onChange={(e) => {
                    const next = Math.min(100, Math.max(0, Number(e.target.value) || 0));
                    setProgress(next);
                    setComplete(next >= 100);
                  }}
                  className="w-16 rounded border px-2 py-1 text-right text-sm"
                  style={{ borderColor: "var(--bt-border)" }}
                />
                <span className="text-xs text-[var(--bt-muted)]">%</span>
              </div>
            </div>

            <label className="grid max-w-xs gap-1 text-sm">
              <span className="text-xs font-medium text-[var(--bt-muted)]">Reminder</span>
              <select
                name="reminderDays"
                defaultValue={initial.reminderDays === null ? "" : String(initial.reminderDays)}
                className="rounded border px-3 py-2 text-sm outline-none focus:border-[var(--bt-primary)]"
                style={{ borderColor: "var(--bt-border)" }}
              >
                {REMINDER_OPTIONS.map((option) => (
                  <option key={option.label} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <div className="flex flex-wrap gap-3 border-b" style={{ borderColor: "var(--bt-border)" }}>
              {visibleSubtabs.map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setSubTab(tab)}
                  className="-mb-px border-b-2 px-1 py-2 text-sm font-medium"
                  style={{
                    borderColor: subTab === tab ? "var(--bt-primary)" : "transparent",
                    color: subTab === tab ? "var(--bt-primary)" : "var(--bt-muted)",
                  }}
                >
                  {tab}
                </button>
              ))}
            </div>

            <div className={subTab === "Predecessors & Links" ? "flex flex-col gap-2" : "hidden"}>
                <h3 className="text-sm font-semibold text-[var(--bt-text)]">Predecessors</h3>
                <div className="overflow-hidden rounded border" style={{ borderColor: "var(--bt-border)" }}>
                  <div className="grid grid-cols-[1fr_160px_100px_40px] gap-2 border-b bg-[var(--bt-page-bg)] px-3 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--bt-muted)]" style={{ borderColor: "var(--bt-border)" }}>
                    <span>Name</span>
                    <span>Type</span>
                    <span>Lag</span>
                    <span />
                  </div>
                  {predecessors.map((row, index) => (
                    <div key={index} className="grid grid-cols-[1fr_160px_100px_40px] items-center gap-2 border-b px-3 py-2 last:border-0" style={{ borderColor: "var(--bt-border)" }}>
                      <select
                        name="predecessorIds"
                        value={row.id}
                        onChange={(e) => {
                          const next = [...predecessors];
                          next[index] = { ...row, id: e.target.value };
                          setPredecessors(next);
                        }}
                        className="rounded border px-2 py-1.5 text-sm"
                        style={{ borderColor: "var(--bt-border)" }}
                      >
                        <option value="">Select…</option>
                        {otherItems.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.title}
                          </option>
                        ))}
                      </select>
                      <select disabled className="rounded border px-2 py-1.5 text-sm text-[var(--bt-muted)]" style={{ borderColor: "var(--bt-border)" }} value="FS">
                        <option value="FS">Finish-to-Start (FS)</option>
                      </select>
                      <div className="relative">
                        <input
                          name={index === 0 ? "lagDays" : undefined}
                          type="number"
                          value={row.lagDays}
                          onChange={(e) => {
                            const next = [...predecessors];
                            next[index] = { ...row, lagDays: Number(e.target.value) || 0 };
                            setPredecessors(next);
                          }}
                          className="w-full rounded border px-2 py-1.5 pr-10 text-sm"
                          style={{ borderColor: "var(--bt-border)" }}
                        />
                        <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-[var(--bt-muted)]">days</span>
                      </div>
                      <button
                        type="button"
                        aria-label="Remove predecessor"
                        onClick={() => setPredecessors(predecessors.filter((_, i) => i !== index))}
                        className="text-[var(--bt-muted)] hover:text-red-600"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => setPredecessors([...predecessors, { id: "", lagDays: 0 }])}
                  className="self-start text-sm font-medium text-[var(--bt-primary)] hover:underline"
                >
                  + Add Predecessor
                </button>
            </div>

            <div className={subTab === "Phases & Tags" ? "grid gap-4 sm:grid-cols-2" : "hidden"}>
                <label className="grid gap-1 text-sm">
                  <span className="text-xs font-medium text-[var(--bt-muted)]">Phase</span>
                  <select
                    name="phaseId"
                    defaultValue={initial.phaseId ?? ""}
                    className="rounded border px-3 py-2 text-sm"
                    style={{ borderColor: "var(--bt-border)" }}
                  >
                    <option value="">Unassigned</option>
                    {phases.map((phase) => (
                      <option key={phase.id} value={phase.id}>
                        {phase.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="grid gap-1 text-sm">
                  <span className="text-xs font-medium text-[var(--bt-muted)]">Tags</span>
                  <input
                    name="tags"
                    value={tagsText}
                    onChange={(e) => setTagsText(e.target.value)}
                    placeholder="Comma separated"
                    className="rounded border px-3 py-2 text-sm"
                    style={{ borderColor: "var(--bt-border)" }}
                  />
                </label>
            </div>

            <div className={subTab === "Viewing" ? "flex flex-col gap-3 text-sm text-[var(--bt-text)]" : "hidden"}>
                <h3 className="font-semibold">Schedule Viewing</h3>
                <label className="flex items-center gap-2">
                  <input type="checkbox" name="showOnGantt" defaultChecked={initial.showOnGantt} />
                  Show on Gantt
                </label>
                <label className="flex items-center gap-2">
                  <input type="checkbox" name="clientVisible" defaultChecked={initial.clientVisible} />
                  Show Client (Full schedule)
                </label>
                <label className="flex items-center gap-2">
                  <input type="checkbox" name="subVisible" defaultChecked={initial.subVisible} />
                  Show Subs / Vendors
                </label>
                <p className="text-xs text-[var(--bt-muted)]">
                  Assigned subs and vendors with job access can see items marked visible to them.
                </p>
            </div>

            <div className={subTab === "Notes" ? "flex flex-col gap-3" : "hidden"}>
                <div className="flex flex-wrap gap-3 border-b" style={{ borderColor: "var(--bt-border)" }}>
                  {(
                    [
                      ["all", "All Notes"],
                      ["internal", "Internal Notes"],
                      ["subs", "Sub Notes"],
                      ["client", "Client Notes"],
                    ] as const
                  ).map(([key, label]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setNotesTab(key)}
                      className="-mb-px border-b-2 px-1 py-2 text-sm font-medium"
                      style={{
                        borderColor: notesTab === key ? "var(--bt-primary)" : "transparent",
                        color: notesTab === key ? "var(--bt-primary)" : "var(--bt-muted)",
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <label className={`grid gap-1 text-sm ${notesTab === "all" || notesTab === "internal" ? "" : "hidden"}`}>
                    <span className="text-xs font-medium text-[var(--bt-muted)]">Internal Notes</span>
                    <textarea
                      name="notesInternal"
                      defaultValue={initial.notesInternal}
                      rows={4}
                      className="rounded border px-3 py-2 text-sm"
                      style={{ borderColor: "var(--bt-border)" }}
                    />
                </label>
                <label className={`grid gap-1 text-sm ${notesTab === "all" || notesTab === "subs" ? "" : "hidden"}`}>
                    <span className="text-xs font-medium text-[var(--bt-muted)]">Sub Notes</span>
                    <textarea
                      name="notesSubs"
                      defaultValue={initial.notesSubs}
                      rows={4}
                      className="rounded border px-3 py-2 text-sm"
                      style={{ borderColor: "var(--bt-border)" }}
                    />
                </label>
                <label className={`grid gap-1 text-sm ${notesTab === "all" || notesTab === "client" ? "" : "hidden"}`}>
                    <span className="text-xs font-medium text-[var(--bt-muted)]">Client Notes</span>
                    <textarea
                      name="notesClient"
                      defaultValue={initial.notesClient}
                      rows={4}
                      className="rounded border px-3 py-2 text-sm"
                      style={{ borderColor: "var(--bt-border)" }}
                    />
                </label>
            </div>

            {subTab === "Shifts" ? (
              <div className="rounded border px-4 py-8 text-center text-sm text-[var(--bt-muted)]" style={{ borderColor: "var(--bt-border)" }}>
                {initial.hasBaseline ? "Baseline dates are set on this schedule." : "The baseline has not been set on this Schedule."}
              </div>
            ) : null}

            {subTab === "Files" ? (
              <div className="rounded border px-4 py-8 text-center text-sm text-[var(--bt-muted)]" style={{ borderColor: "var(--bt-border)" }}>
                Attach files from the job Files page. Per-item attachments are coming next.
              </div>
            ) : null}

            {subTab === "RFIs" ? (
              <div className="rounded border px-4 py-8 text-center text-sm text-[var(--bt-muted)]" style={{ borderColor: "var(--bt-border)" }}>
                Create RFIs from the job RFIs page. Linking an RFI to this item is coming next.
              </div>
            ) : null}
        </div>
        {mainTab === "related" ? (
          <div className="rounded border px-4 py-8 text-center text-sm text-[var(--bt-muted)]" style={{ borderColor: "var(--bt-border)" }}>
            No related tasks yet. Add tasks from the job Tasks page.
          </div>
        ) : null}

        {state.error ? (
          <p role="alert" className="text-xs text-red-600">
            {state.error}
          </p>
        ) : null}
        {state.ok ? <p className="text-xs text-green-700">Saved.</p> : null}
      </div>

      <div className="flex items-center justify-end gap-2 border-t px-4 py-3" style={{ borderColor: "var(--bt-border)" }}>
        <button
          type="submit"
          disabled={pending}
          className="rounded px-4 py-2 text-sm font-semibold text-[var(--bt-on-primary)] disabled:opacity-50"
          style={{ background: "var(--bt-primary)" }}
        >
          {pending ? "Saving…" : "Save"}
        </button>
      </div>
    </form>
  );
}
