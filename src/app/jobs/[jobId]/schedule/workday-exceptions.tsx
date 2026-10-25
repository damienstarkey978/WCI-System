"use client";

import { useActionState } from "react";

import { formatDateUtc } from "@/lib/format";

import { addWorkdayExceptionAction, deleteWorkdayExceptionAction, type ActionState } from "./actions";

const INITIAL: ActionState = {};

export interface WorkdayException {
  readonly id: string;
  readonly date: string;
  readonly reason: string | null;
}

/** Org-wide holidays and shutdowns the schedule engine skips (NonWorkingDay), shown on each job's Schedule like BT's Workday Exceptions tab. */
export function WorkdayExceptions({ jobId, days }: { jobId: string; days: readonly WorkdayException[] }) {
  const [state, formAction, pending] = useActionState(addWorkdayExceptionAction, INITIAL);

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-[var(--bt-muted)]">
        Dates on this list are skipped when task dates are calculated, in addition to weekends. They apply to every job.
      </p>
      <form action={formAction} className="flex flex-wrap items-end gap-2 rounded-lg border bg-[var(--bt-panel-bg)] p-4" style={{ borderColor: "var(--bt-border)" }}>
        <input type="hidden" name="jobId" value={jobId} />
        <label className="flex flex-col gap-1 text-xs font-semibold text-[var(--bt-muted)]">
          Date
          <input type="date" name="date" required className="rounded border px-2 py-1.5 text-sm" style={{ borderColor: "var(--bt-border)" }} />
        </label>
        <label className="flex min-w-[12rem] flex-1 flex-col gap-1 text-xs font-semibold text-[var(--bt-muted)]">
          Reason (optional)
          <input name="reason" placeholder="Memorial Day" className="rounded border px-2 py-1.5 text-sm" style={{ borderColor: "var(--bt-border)" }} />
        </label>
        <button type="submit" disabled={pending} className="rounded px-4 py-2 text-sm font-semibold text-[var(--bt-on-primary)] disabled:opacity-50" style={{ background: "var(--bt-primary)" }}>
          {pending ? "Adding…" : "Add exception"}
        </button>
        {state.error ? <span className="text-xs text-red-600">{state.error}</span> : null}
      </form>

      <div className="overflow-hidden rounded-lg border bg-[var(--bt-panel-bg)]" style={{ borderColor: "var(--bt-border)" }}>
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b text-xs font-semibold uppercase tracking-wide text-[var(--bt-muted)]" style={{ borderColor: "var(--bt-border)" }}>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Reason</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {days.map((day) => (
              <tr key={day.id} className="border-b last:border-0" style={{ borderColor: "var(--bt-border)" }}>
                <td className="px-4 py-2">{formatDateUtc(new Date(day.date))}</td>
                <td className="px-4 py-2 text-[var(--bt-muted)]">{day.reason ?? ""}</td>
                <td className="px-4 py-2 text-right">
                  <form action={deleteWorkdayExceptionAction}>
                    <input type="hidden" name="jobId" value={jobId} />
                    <input type="hidden" name="id" value={day.id} />
                    <button type="submit" className="text-xs text-[var(--bt-muted)] hover:text-red-600 hover:underline">
                      Remove
                    </button>
                  </form>
                </td>
              </tr>
            ))}
            {days.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-4 py-6 text-center text-[var(--bt-muted)]">
                  No workday exceptions yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
