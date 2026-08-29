"use client";

import { useActionState, useRef } from "react";

import { createTodoAction, type ActionState } from "./actions";

const INITIAL: ActionState = {};

export function TodoForm({ jobId }: { jobId: string }) {
  const [state, formAction, pending] = useActionState(createTodoAction, INITIAL);
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form
      ref={formRef}
      action={async (formData) => {
        await formAction(formData);
        formRef.current?.reset();
      }}
      className="flex flex-wrap items-end gap-3 rounded-lg border bg-[var(--bt-panel-bg)] p-4"
      style={{ borderColor: "var(--bt-border)" }}
    >
      <input type="hidden" name="jobId" value={jobId} />

      <label className="grid min-w-48 flex-1 gap-1 text-xs">
        <span className="font-medium text-[var(--bt-muted)]">Title</span>
        <input
          name="title"
          required
          placeholder="Frame second floor"
          className="rounded border px-3 py-2 text-sm outline-none focus:border-[var(--bt-primary)]"
          style={{ borderColor: "var(--bt-border)" }}
        />
      </label>

      <label className="grid gap-1 text-xs">
        <span className="font-medium text-[var(--bt-muted)]">Priority</span>
        <select
          name="priority"
          defaultValue="MEDIUM"
          className="rounded border px-3 py-2 text-sm outline-none focus:border-[var(--bt-primary)]"
          style={{ borderColor: "var(--bt-border)" }}
        >
          <option value="LOW">Low</option>
          <option value="MEDIUM">Medium</option>
          <option value="HIGH">High</option>
        </select>
      </label>

      <label className="grid gap-1 text-xs">
        <span className="font-medium text-[var(--bt-muted)]">Due date</span>
        <input
          type="date"
          name="dueDate"
          className="rounded border px-3 py-2 text-sm outline-none focus:border-[var(--bt-primary)]"
          style={{ borderColor: "var(--bt-border)" }}
        />
      </label>

      {state.error ? <p className="w-full text-xs text-red-600">{state.error}</p> : null}

      <button
        type="submit"
        disabled={pending}
        className="rounded px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        style={{ background: "var(--bt-primary)" }}
      >
        {pending ? "Adding…" : "+ Add task"}
      </button>
    </form>
  );
}
