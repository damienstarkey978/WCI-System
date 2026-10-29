"use client";

import { useActionState } from "react";

import { updateTakeoffMeasurementsAction, type ActionState } from "./actions";

const INITIAL: ActionState = {};

/** Takeoff-lite measurement entry — freeform plan/quantity notes on the takeoff. */
export function TakeoffMeasurementsForm({
  jobId,
  takeoffId,
  notes,
}: {
  jobId: string;
  takeoffId: string;
  notes: string | null;
}) {
  const [state, formAction, pending] = useActionState(updateTakeoffMeasurementsAction, INITIAL);

  return (
    <form
      action={formAction}
      className="flex flex-col gap-3 rounded-lg border p-3 sm:p-4"
      style={{ borderColor: "var(--bt-border)", background: "var(--bt-panel-bg)" }}
    >
      <input type="hidden" name="jobId" value={jobId} />
      <input type="hidden" name="takeoffId" value={takeoffId} />
      <div>
        <h2 className="text-sm font-semibold text-[var(--bt-text)]">Measurements</h2>
        <p className="mt-0.5 text-xs text-[var(--bt-muted)]">
          Room quantities, waste factors, and plan references. Use with attached plans; AI draft reads
          these notes.
        </p>
      </div>
      <label className="grid gap-1 text-sm">
        <span className="sr-only">Measurement notes</span>
        <textarea
          name="notes"
          rows={6}
          defaultValue={notes ?? ""}
          placeholder="e.g. Main level LVP ~1,240 sf living + halls, 10% waste. Exterior stucco 2,100 sf walls per sheet A-3."
          className="min-h-[7rem] w-full rounded border px-3 py-2 text-sm outline-none focus:border-[var(--bt-primary)]"
          style={{ borderColor: "var(--bt-border)" }}
        />
      </label>
      {state.error ? (
        <p role="alert" className="text-xs text-red-600">
          {state.error}
        </p>
      ) : null}
      {state.ok ? <p className="text-xs text-green-700">Measurements saved.</p> : null}
      <button
        type="submit"
        disabled={pending}
        className="self-start rounded px-4 py-2.5 text-sm font-semibold text-[var(--bt-on-primary)] disabled:opacity-50 sm:py-2"
        style={{ background: "var(--bt-primary)" }}
      >
        {pending ? "Saving…" : "Save measurements"}
      </button>
    </form>
  );
}
