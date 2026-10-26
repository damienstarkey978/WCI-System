"use client";

import { useActionState } from "react";

import { updateRfiAction, type ActionState } from "../actions";

const INITIAL: ActionState = {};
const REMINDERS = ["None", "1 Day Before", "2 Days Before", "1 Week Before"] as const;

export function RfiDetailForm({
  jobId,
  rfiId,
  rfiNumber,
  editable,
  users,
  initial,
}: {
  jobId: string;
  rfiId: string;
  rfiNumber: string;
  editable: boolean;
  users: readonly { id: string; email: string; name: string | null }[];
  initial: {
    title: string;
    question: string;
    dueDate: string;
    assigneeUserId: string;
    reminder: string;
    relatedItemRef: string;
  };
}) {
  const [state, formAction, pending] = useActionState(updateRfiAction, INITIAL);

  return (
    <form action={formAction} className="flex flex-col gap-3 rounded-lg border bg-[var(--bt-panel-bg)] p-4" style={{ borderColor: "var(--bt-border)" }}>
      <input type="hidden" name="jobId" value={jobId} />
      <input type="hidden" name="rfiId" value={rfiId} />

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-3">
          <label className="grid gap-1 text-sm">
            <span className="text-xs font-medium text-[var(--bt-muted)]">Title</span>
            <input
              name="title"
              required
              defaultValue={initial.title}
              disabled={!editable}
              className="rounded border px-3 py-2 text-sm disabled:opacity-60"
              style={{ borderColor: "var(--bt-border)" }}
            />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="text-xs font-medium text-[var(--bt-muted)]">ID #</span>
            <input value={rfiNumber} readOnly className="rounded border px-3 py-2 text-sm opacity-80" style={{ borderColor: "var(--bt-border)", background: "var(--bt-bg)" }} />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="text-xs font-medium text-[var(--bt-muted)]">Assignee</span>
            <select
              name="assigneeUserId"
              defaultValue={initial.assigneeUserId}
              disabled={!editable}
              className="rounded border px-3 py-2 text-sm disabled:opacity-60"
              style={{ borderColor: "var(--bt-border)" }}
            >
              <option value="">Unassigned</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name || u.email}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="flex flex-col gap-3">
          <label className="grid gap-1 text-sm">
            <span className="text-xs font-medium text-[var(--bt-muted)]">Due date</span>
            <input
              type="date"
              name="dueDate"
              required
              defaultValue={initial.dueDate}
              disabled={!editable}
              className="rounded border px-3 py-2 text-sm disabled:opacity-60"
              style={{ borderColor: "var(--bt-border)" }}
            />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="text-xs font-medium text-[var(--bt-muted)]">Reminder</span>
            <select
              name="reminder"
              defaultValue={initial.reminder || "None"}
              disabled={!editable}
              className="rounded border px-3 py-2 text-sm disabled:opacity-60"
              style={{ borderColor: "var(--bt-border)" }}
            >
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
              defaultValue={initial.relatedItemRef}
              disabled={!editable}
              className="rounded border px-3 py-2 text-sm disabled:opacity-60"
              style={{ borderColor: "var(--bt-border)" }}
            />
          </label>
        </div>
      </div>

      <label className="grid gap-1 text-sm">
        <span className="text-xs font-medium text-[var(--bt-muted)]">Question</span>
        <textarea
          name="question"
          required
          rows={6}
          defaultValue={initial.question}
          disabled={!editable}
          className="rounded border px-3 py-2 text-sm disabled:opacity-60"
          style={{ borderColor: "var(--bt-border)" }}
        />
      </label>

      {state.error ? <p className="text-xs text-red-600">{state.error}</p> : null}
      {state.ok ? <p className="text-xs text-green-700">Saved.</p> : null}

      {editable ? (
        <button type="submit" disabled={pending} className="self-start rounded border px-4 py-2 text-sm font-semibold disabled:opacity-50" style={{ borderColor: "var(--bt-border)" }}>
          {pending ? "Saving…" : "Save"}
        </button>
      ) : null}
    </form>
  );
}
