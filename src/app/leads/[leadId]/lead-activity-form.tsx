"use client";

import { useActionState, useRef } from "react";

import { createLeadActivityAction, type ActionState } from "./actions";

const INITIAL: ActionState = {};

const TYPES = [
  { value: "NOTE", label: "Note" },
  { value: "CALL", label: "Call" },
  { value: "EMAIL", label: "Email" },
  { value: "MEETING", label: "Meeting" },
  { value: "TASK", label: "Task" },
] as const;

export function LeadActivityForm({ leadId }: { leadId: string }) {
  const [state, formAction, pending] = useActionState(createLeadActivityAction, INITIAL);
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
      <input type="hidden" name="leadId" value={leadId} />
      <div className="flex flex-wrap gap-2">
        <select
          name="type"
          defaultValue="NOTE"
          className="rounded border px-2 py-2 text-sm outline-none focus:border-[var(--bt-primary)]"
          style={{ borderColor: "var(--bt-border)" }}
        >
          {TYPES.map((type) => (
            <option key={type.value} value={type.value}>
              {type.label}
            </option>
          ))}
        </select>
        <input
          type="date"
          name="dueDate"
          title="Due date (tasks only)"
          className="rounded border px-2 py-2 text-sm outline-none focus:border-[var(--bt-primary)]"
          style={{ borderColor: "var(--bt-border)" }}
        />
      </div>
      <textarea
        name="note"
        required
        rows={2}
        placeholder="Log a call, email, meeting, or follow-up task…"
        className="mt-2 w-full rounded border px-3 py-2 text-sm outline-none focus:border-[var(--bt-primary)]"
        style={{ borderColor: "var(--bt-border)" }}
      />
      {state.error ? (
        <p role="alert" className="mt-2 text-xs text-red-600">
          {state.error}
        </p>
      ) : null}
      <div className="mt-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded px-3 py-1.5 text-xs font-semibold text-[var(--bt-on-primary)] disabled:opacity-50"
          style={{ background: "var(--bt-primary)" }}
        >
          {pending ? "Saving…" : "Add activity"}
        </button>
      </div>
    </form>
  );
}
