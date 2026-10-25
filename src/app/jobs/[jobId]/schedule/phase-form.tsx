"use client";

import { useActionState } from "react";

import { createPhaseAction, type ActionState } from "./actions";

const INITIAL: ActionState = {};

export function PhaseForm({ jobId, scheduleId }: { jobId: string; scheduleId: string }) {
  const [state, formAction, pending] = useActionState(createPhaseAction, INITIAL);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="jobId" value={jobId} />
      <input type="hidden" name="scheduleId" value={scheduleId} />
      <label className="flex flex-col gap-1 text-xs font-semibold text-[var(--bt-muted)]">
        Phase name
        <input name="name" required maxLength={120} placeholder="Framing" className="rounded border px-3 py-2 text-sm outline-none focus:border-[var(--bt-primary)]" style={{ borderColor: "var(--bt-border)" }} />
      </label>
      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending} className="rounded px-4 py-2 text-sm font-semibold text-[var(--bt-on-primary)] disabled:opacity-50" style={{ background: "var(--bt-primary)" }}>
          {pending ? "Adding…" : "Add phase"}
        </button>
        {state.ok ? <span className="text-xs text-[var(--bt-muted)]">Added.</span> : null}
        {state.error ? <span className="text-xs text-red-600">{state.error}</span> : null}
      </div>
    </form>
  );
}
