"use client";

import { useActionState, useRef } from "react";

import { addScheduleItemAction, type ActionState } from "./actions";

const INITIAL: ActionState = {};

export interface ExistingItem {
  readonly id: string;
  readonly title: string;
}

export function AddItemForm({ jobId, scheduleId, existingItems }: { jobId: string; scheduleId: string; existingItems: readonly ExistingItem[] }) {
  const [state, formAction, pending] = useActionState(addScheduleItemAction, INITIAL);
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form
      ref={formRef}
      action={async (formData) => {
        await formAction(formData);
        formRef.current?.reset();
      }}
      className="rounded-lg border bg-[var(--bt-panel-bg)] p-4"
      style={{ borderColor: "var(--bt-border)" }}
    >
      <input type="hidden" name="jobId" value={jobId} />
      <input type="hidden" name="scheduleId" value={scheduleId} />
      <h2 className="text-sm font-semibold text-[var(--bt-text)]">Add schedule item</h2>
      <div className="mt-3 grid gap-3 sm:grid-cols-4">
        <label className="grid gap-1 text-sm sm:col-span-2">
          <span className="text-xs font-medium text-[var(--bt-muted)]">Title</span>
          <input name="title" required className="rounded border px-3 py-2 text-sm outline-none focus:border-[var(--bt-primary)]" style={{ borderColor: "var(--bt-border)" }} />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="text-xs font-medium text-[var(--bt-muted)]">Duration (days)</span>
          <input name="durationDays" type="number" min="1" defaultValue="1" required className="rounded border px-3 py-2 text-sm outline-none focus:border-[var(--bt-primary)]" style={{ borderColor: "var(--bt-border)" }} />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="text-xs font-medium text-[var(--bt-muted)]">Lag (days)</span>
          <input name="lagDays" type="number" defaultValue="0" className="rounded border px-3 py-2 text-sm outline-none focus:border-[var(--bt-primary)]" style={{ borderColor: "var(--bt-border)" }} />
        </label>
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1 text-sm">
          <span className="text-xs font-medium text-[var(--bt-muted)]">Depends on (predecessors)</span>
          <select name="predecessorIds" multiple className="h-24 rounded border px-3 py-2 text-sm outline-none focus:border-[var(--bt-primary)]" style={{ borderColor: "var(--bt-border)" }}>
            {existingItems.map((item) => (
              <option key={item.id} value={item.id}>
                {item.title}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-sm">
          <span className="text-xs font-medium text-[var(--bt-muted)]">Manual start date (overrides auto-scheduling)</span>
          <input type="date" name="manualStartDate" className="rounded border px-3 py-2 text-sm outline-none focus:border-[var(--bt-primary)]" style={{ borderColor: "var(--bt-border)" }} />
        </label>
      </div>
      <div className="mt-2 flex flex-wrap gap-4 text-xs text-[var(--bt-muted)]">
        <label className="flex items-center gap-1.5">
          <input type="checkbox" name="clientVisible" defaultChecked />
          Visible to client
        </label>
        <label className="flex items-center gap-1.5">
          <input type="checkbox" name="subVisible" defaultChecked />
          Visible to subs
        </label>
      </div>
      {state.error ? (
        <p role="alert" className="mt-2 text-xs text-red-600">
          {state.error}
        </p>
      ) : null}
      <div className="mt-3">
        <button type="submit" disabled={pending} className="rounded px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" style={{ background: "var(--bt-primary)" }}>
          {pending ? "Adding…" : "Add item"}
        </button>
      </div>
    </form>
  );
}
