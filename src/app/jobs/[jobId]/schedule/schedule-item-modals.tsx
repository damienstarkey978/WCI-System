"use client";

import { useState, type CSSProperties, type ReactNode } from "react";

import {
  ScheduleItemForm,
  defaultNewScheduleItemValues,
  type PhaseOption,
  type ScheduleItemFormValues,
  type ScheduleItemOption,
  type StaffOption,
} from "./schedule-item-form";

function ModalShell({
  open,
  onClose,
  children,
  labelledBy,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  labelledBy: string;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div
        className="relative flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-lg bg-[var(--bt-panel-bg)] shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
      >
        <div className="overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}

export function NewScheduleItemButton({
  jobId,
  scheduleId,
  jobName,
  existingItems,
  phases,
  staff,
  children,
  className,
  style,
  "aria-label": ariaLabel,
}: {
  jobId: string;
  scheduleId: string;
  jobName: string;
  existingItems: readonly ScheduleItemOption[];
  phases: readonly PhaseOption[];
  staff: readonly StaffOption[];
  children?: ReactNode;
  className?: string;
  style?: CSSProperties;
  "aria-label"?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={ariaLabel}
        className={className ?? "h-9 rounded px-4 text-sm font-semibold text-[var(--bt-on-primary)]"}
        style={style ?? { background: "var(--bt-primary)" }}
      >
        {children ?? "New Schedule Item"}
      </button>
      <ModalShell open={open} onClose={() => setOpen(false)} labelledBy="new-schedule-item-title">
        <ScheduleItemForm
          jobId={jobId}
          scheduleId={scheduleId}
          jobName={jobName}
          existingItems={existingItems}
          phases={phases}
          staff={staff}
          initial={defaultNewScheduleItemValues()}
          onClose={() => setOpen(false)}
          showShiftsAndRfis={false}
        />
      </ModalShell>
    </>
  );
}

export function EditScheduleItemButton({
  jobId,
  scheduleId,
  jobName,
  existingItems,
  phases,
  staff,
  initial,
  children,
  className,
}: {
  jobId: string;
  scheduleId: string;
  jobName: string;
  existingItems: readonly ScheduleItemOption[];
  phases: readonly PhaseOption[];
  staff: readonly StaffOption[];
  initial: ScheduleItemFormValues & { id: string };
  children: ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={className ?? "text-left hover:underline"}>
        {children}
      </button>
      <ModalShell open={open} onClose={() => setOpen(false)} labelledBy="edit-schedule-item-title">
        <ScheduleItemForm
          jobId={jobId}
          scheduleId={scheduleId}
          jobName={jobName}
          existingItems={existingItems}
          phases={phases}
          staff={staff}
          initial={initial}
          onClose={() => setOpen(false)}
          showShiftsAndRfis
        />
      </ModalShell>
    </>
  );
}
