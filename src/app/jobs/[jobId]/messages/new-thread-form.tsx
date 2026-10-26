"use client";

import { useActionState } from "react";

import { createThreadAction, type ActionState } from "./actions";

const INITIAL: ActionState = {};

export function NewThreadForm({ jobId }: { jobId: string }) {
  const [state, formAction, pending] = useActionState(createThreadAction, INITIAL);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="jobId" value={jobId} />
      <label className="flex flex-col gap-1 text-xs font-semibold text-[var(--bt-muted)]">
        Subject
        <input name="subject" required maxLength={200} className="rounded border px-3 py-2 text-sm font-normal outline-none focus:border-[var(--bt-primary)]" style={{ borderColor: "var(--bt-border)" }} />
      </label>
      <label className="flex flex-col gap-1 text-xs font-semibold text-[var(--bt-muted)]">
        Message
        <textarea name="body" required rows={5} className="rounded border px-3 py-2 text-sm font-normal outline-none focus:border-[var(--bt-primary)]" style={{ borderColor: "var(--bt-border)" }} />
      </label>
      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending} className="rounded px-4 py-2 text-sm font-semibold text-[var(--bt-on-primary)] disabled:opacity-50" style={{ background: "var(--bt-primary)" }}>
          {pending ? "Sending…" : "Send"}
        </button>
        {state.ok ? <span className="text-xs text-[var(--bt-muted)]">Sent. Find it in the list.</span> : null}
        {state.error ? <span className="text-xs text-red-600">{state.error}</span> : null}
      </div>
    </form>
  );
}
