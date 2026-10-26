"use client";

import { useActionState } from "react";

import { createCustomFieldAction, type ActionState } from "./actions";

const INITIAL: ActionState = {};

export function CustomFieldForm({ jobId }: { jobId: string }) {
  const [state, formAction, pending] = useActionState(createCustomFieldAction, INITIAL);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="jobId" value={jobId} />
      <p className="text-xs text-[var(--bt-muted)]">A new field appears on every job&apos;s Job Info page.</p>
      <label className="flex flex-col gap-1 text-xs font-semibold text-[var(--bt-muted)]">
        Field name
        <input name="name" required maxLength={80} className="rounded border px-3 py-2 text-sm outline-none focus:border-[var(--bt-primary)]" style={{ borderColor: "var(--bt-border)" }} />
      </label>
      <label className="flex flex-col gap-1 text-xs font-semibold text-[var(--bt-muted)]">
        Type
        <select name="type" defaultValue="TEXT" className="rounded border px-3 py-2 text-sm" style={{ borderColor: "var(--bt-border)" }}>
          <option value="TEXT">Text</option>
          <option value="CHECKBOX">Checkbox</option>
        </select>
      </label>
      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending} className="rounded px-4 py-2 text-sm font-semibold text-[var(--bt-on-primary)] disabled:opacity-50" style={{ background: "var(--bt-primary)" }}>
          {pending ? "Adding…" : "Add field"}
        </button>
        {state.ok ? <span className="text-xs text-[var(--bt-muted)]">Added.</span> : null}
        {state.error ? <span className="text-xs text-red-600">{state.error}</span> : null}
      </div>
    </form>
  );
}
