"use client";

import { useActionState } from "react";

import { createRfiAction, type ActionState } from "./actions";

const INITIAL: ActionState = {};

const REMINDERS = ["None", "1 Day Before", "2 Days Before", "1 Week Before"] as const;

export interface UserOption {
  readonly id: string;
  readonly email: string;
  readonly name?: string | null;
}

export function CreateRfiForm({ jobId, users }: { jobId: string; users: readonly UserOption[] }) {
  const [state, formAction, pending] = useActionState(createRfiAction, INITIAL);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="jobId" value={jobId} />

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-3">
          <label className="grid gap-1 text-sm">
            <span className="text-xs font-medium text-[var(--bt-muted)]">Title</span>
            <input name="title" required className="rounded border px-3 py-2 text-sm outline-none focus:border-[var(--bt-primary)]" style={{ borderColor: "var(--bt-border)" }} />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="text-xs font-medium text-[var(--bt-muted)]">ID #</span>
            <input value="(Auto Assign #)" readOnly className="rounded border px-3 py-2 text-sm opacity-80" style={{ borderColor: "var(--bt-border)", background: "var(--bt-bg)" }} />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="text-xs font-medium text-[var(--bt-muted)]">Assignee</span>
            <select name="assigneeUserId" defaultValue="" className="rounded border px-3 py-2 text-sm" style={{ borderColor: "var(--bt-border)" }}>
              <option value="">Unassigned</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name || u.email}
                </option>
              ))}
            </select>
          </label>
          <p className="text-xs text-[var(--bt-muted)]">Viewers: only active subs with job access (portal) can be linked later.</p>
        </div>

        <div className="flex flex-col gap-3">
          <label className="grid gap-1 text-sm">
            <span className="text-xs font-medium text-[var(--bt-muted)]">
              Due date <span className="text-red-600">*</span>
            </span>
            <input type="date" name="dueDate" required className="rounded border px-3 py-2 text-sm" style={{ borderColor: "var(--bt-border)" }} />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="text-xs font-medium text-[var(--bt-muted)]">Reminder</span>
            <select name="reminder" defaultValue="None" className="rounded border px-3 py-2 text-sm" style={{ borderColor: "var(--bt-border)" }}>
              {REMINDERS.map((label) => (
                <option key={label} value={label}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-sm">
            <span className="text-xs font-medium text-[var(--bt-muted)]">Related item</span>
            <input
              name="relatedItemRef"
              placeholder="e.g. schedule_item:… or leave blank"
              className="rounded border px-3 py-2 text-sm"
              style={{ borderColor: "var(--bt-border)" }}
            />
          </label>
        </div>
      </div>

      <label className="grid gap-1 text-sm">
        <span className="text-xs font-medium text-[var(--bt-muted)]">Question</span>
        <textarea name="question" required rows={6} className="rounded border px-3 py-2 text-sm" style={{ borderColor: "var(--bt-border)" }} />
      </label>

      {state.error ? (
        <p role="alert" className="text-xs text-red-600">
          {state.error}
        </p>
      ) : null}

      <button type="submit" disabled={pending} className="self-end rounded px-4 py-2 text-sm font-semibold text-[var(--bt-on-primary)] disabled:opacity-50" style={{ background: "var(--bt-primary)" }}>
        {pending ? "Saving…" : "Save"}
      </button>
    </form>
  );
}
