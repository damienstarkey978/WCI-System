"use client";

import { useActionState } from "react";

import { createSelectionAction, type ActionState } from "./actions";
import { SelectionOptionRows } from "./option-rows";

const INITIAL: ActionState = {};

export interface AllowanceOption {
  readonly id: string;
  readonly title: string;
}

export function CreateSelectionForm({ jobId, allowances }: { jobId: string; allowances: readonly AllowanceOption[] }) {
  const [state, formAction, pending] = useActionState(createSelectionAction, INITIAL);

  return (
    <form action={formAction} className="rounded-lg border bg-[var(--bt-panel-bg)] p-4" style={{ borderColor: "var(--bt-border)" }}>
      <input type="hidden" name="jobId" value={jobId} />
      <h2 className="text-sm font-semibold text-[var(--bt-text)]">New selection</h2>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <label className="grid gap-1 text-sm">
          <span className="text-xs font-medium text-[var(--bt-muted)]">Title</span>
          <input name="title" required className="rounded border px-3 py-2 text-sm outline-none focus:border-[var(--bt-primary)]" style={{ borderColor: "var(--bt-border)" }} />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="text-xs font-medium text-[var(--bt-muted)]">Due date</span>
          <input type="date" name="dueDate" className="rounded border px-3 py-2 text-sm outline-none focus:border-[var(--bt-primary)]" style={{ borderColor: "var(--bt-border)" }} />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="text-xs font-medium text-[var(--bt-muted)]">Allowance</span>
          <select name="allowanceId" defaultValue="" className="rounded border px-3 py-2 text-sm outline-none focus:border-[var(--bt-primary)]" style={{ borderColor: "var(--bt-border)" }}>
            <option value="">None</option>
            {allowances.map((allowance) => (
              <option key={allowance.id} value={allowance.id}>
                {allowance.title}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="mt-3 grid gap-1 text-sm">
        <span className="text-xs font-medium text-[var(--bt-muted)]">Description</span>
        <textarea name="description" rows={2} className="rounded border px-3 py-2 text-sm outline-none focus:border-[var(--bt-primary)]" style={{ borderColor: "var(--bt-border)" }} />
      </label>
      <div className="mt-3">
        <SelectionOptionRows />
      </div>
      {state.error ? (
        <p role="alert" className="mt-2 text-xs text-red-600">
          {state.error}
        </p>
      ) : null}
      <div className="mt-3">
        <button type="submit" disabled={pending} className="rounded px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" style={{ background: "var(--bt-primary)" }}>
          {pending ? "Creating…" : "Create selection"}
        </button>
      </div>
    </form>
  );
}
