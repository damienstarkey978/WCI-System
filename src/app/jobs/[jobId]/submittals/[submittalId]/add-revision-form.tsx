"use client";

import { useActionState } from "react";

import { addSubmittalRevisionAction, type ActionState } from "../actions";

const INITIAL: ActionState = {};

export function AddRevisionForm({ jobId, submittalId }: { jobId: string; submittalId: string }) {
  const [state, formAction, pending] = useActionState(addSubmittalRevisionAction, INITIAL);

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="jobId" value={jobId} />
      <input type="hidden" name="submittalId" value={submittalId} />
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="grid gap-1 text-sm">
          <span className="text-xs font-medium text-[var(--bt-muted)]">Document link</span>
          <input name="documentUrl" type="url" required placeholder="https://…" className="rounded border px-3 py-2 text-sm" style={{ borderColor: "var(--bt-border)" }} />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="text-xs font-medium text-[var(--bt-muted)]">Notes</span>
          <input name="notes" className="rounded border px-3 py-2 text-sm" style={{ borderColor: "var(--bt-border)" }} />
        </label>
      </div>
      {state.error ? <p className="text-xs text-red-600">{state.error}</p> : null}
      {state.ok ? <p className="text-xs text-green-700">Revision added.</p> : null}
      <button type="submit" disabled={pending} className="self-start rounded px-3 py-1.5 text-xs font-semibold text-[var(--bt-on-primary)] disabled:opacity-50" style={{ background: "var(--bt-primary)" }}>
        {pending ? "Saving…" : "Add revision"}
      </button>
    </form>
  );
}
