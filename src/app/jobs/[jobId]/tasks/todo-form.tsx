"use client";

import { useActionState, useRef } from "react";

import { createTodoAction, type ActionState } from "./actions";
import type { StaffOption } from "./task-detail-drawer";

const INITIAL: ActionState = {};

export function TodoForm({ jobId, staff }: { jobId: string; staff: readonly StaffOption[] }) {
  const [state, formAction, pending] = useActionState(createTodoAction, INITIAL);
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form
      ref={formRef}
      action={async (formData) => {
        await formAction(formData);
        formRef.current?.reset();
      }}
      className="flex flex-col gap-3"
    >
      <input type="hidden" name="jobId" value={jobId} />

      <label className="grid gap-1 text-sm">
        <span className="text-xs font-medium text-[var(--bt-muted)]">Title</span>
        <input
          name="title"
          required
          placeholder="Task title"
          className="rounded border px-3 py-2 text-sm outline-none focus:border-[var(--bt-primary)]"
          style={{ borderColor: "var(--bt-border)" }}
        />
      </label>

      <label className="grid gap-1 text-sm">
        <span className="text-xs font-medium text-[var(--bt-muted)]">Description</span>
        <textarea
          name="description"
          rows={3}
          className="rounded border px-3 py-2 text-sm outline-none focus:border-[var(--bt-primary)]"
          style={{ borderColor: "var(--bt-border)" }}
        />
      </label>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1 text-sm">
          <span className="text-xs font-medium text-[var(--bt-muted)]">Assignee</span>
          <select name="assigneeUserId" defaultValue="" className="rounded border px-3 py-2 text-sm" style={{ borderColor: "var(--bt-border)" }}>
            <option value="">No assignee</option>
            {staff.map((person) => (
              <option key={person.id} value={person.id}>
                {person.name}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-sm">
          <span className="text-xs font-medium text-[var(--bt-muted)]">Due date</span>
          <input type="date" name="dueDate" className="rounded border px-3 py-2 text-sm" style={{ borderColor: "var(--bt-border)" }} />
        </label>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1 text-sm">
          <span className="text-xs font-medium text-[var(--bt-muted)]">Priority</span>
          <select name="priority" defaultValue="MEDIUM" className="rounded border px-3 py-2 text-sm" style={{ borderColor: "var(--bt-border)" }}>
            <option value="LOW">Low</option>
            <option value="MEDIUM">Medium</option>
            <option value="HIGH">High</option>
          </select>
        </label>
        <label className="grid gap-1 text-sm">
          <span className="text-xs font-medium text-[var(--bt-muted)]">Type / Tag</span>
          <input
            name="category"
            placeholder="Punch list"
            className="rounded border px-3 py-2 text-sm"
            style={{ borderColor: "var(--bt-border)" }}
          />
        </label>
      </div>

      {state.error ? <p className="text-xs text-red-600">{state.error}</p> : null}
      {state.ok ? <p className="text-xs text-green-700">Task added.</p> : null}

      <button
        type="submit"
        disabled={pending}
        className="rounded px-4 py-2 text-sm font-semibold text-[var(--bt-on-primary)] disabled:opacity-50"
        style={{ background: "var(--bt-primary)" }}
      >
        {pending ? "Adding…" : "Save"}
      </button>
    </form>
  );
}
