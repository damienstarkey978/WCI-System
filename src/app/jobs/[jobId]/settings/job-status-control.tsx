"use client";

import { useActionState } from "react";

import { transitionJobStatusAction } from "@/app/admin/jobs/actions";

const INITIAL: { error?: string; ok?: boolean } = {};

const LABEL: Record<string, string> = { PRE_SALE: "Pre-sale", OPEN: "Open", WARRANTY: "Warranty", CLOSED: "Closed" };

/** Moves the job through the guarded status machine (src/lib/job-status.ts); only legal next statuses are offered. */
export function JobStatusControl({ jobId, current, next }: { jobId: string; current: string; next: readonly string[] }) {
  const [state, formAction, pending] = useActionState(transitionJobStatusAction, INITIAL);

  // Rendered inside the job details form, and forms cannot nest: so this is a plain
  // container whose button posts the enclosing form's fields to the status action
  // (formAction), and the action only reads jobId and status from them.
  return (
    <div className="flex flex-col gap-1">
      <input type="hidden" name="jobId" value={jobId} />
      <div className="flex items-center gap-2">
        <select name="status" defaultValue={current} aria-label="Status" className="rounded border px-3 py-2 text-sm" style={{ borderColor: "var(--bt-border)" }}>
          <option value={current}>{LABEL[current] ?? current}</option>
          {next.map((status) => (
            <option key={status} value={status}>
              {LABEL[status] ?? status}
            </option>
          ))}
        </select>
        {next.length > 0 ? (
          <button type="submit" formAction={formAction} disabled={pending} className="rounded border px-3 py-2 text-xs font-semibold disabled:opacity-50" style={{ borderColor: "var(--bt-border)" }}>
            {pending ? "Saving…" : "Change"}
          </button>
        ) : null}
      </div>
      {state.error ? <span className="text-xs text-red-600">{state.error}</span> : null}
    </div>
  );
}
