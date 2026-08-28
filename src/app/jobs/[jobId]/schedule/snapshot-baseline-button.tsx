"use client";

import { useActionState } from "react";

import { snapshotBaselineAction, type ActionState } from "./actions";

const INITIAL: ActionState = {};

export function SnapshotBaselineButton({ jobId, scheduleId, hasBaseline }: { jobId: string; scheduleId: string; hasBaseline: boolean }) {
  const [state, formAction, pending] = useActionState(snapshotBaselineAction, INITIAL);

  return (
    <form action={formAction} className="flex items-center gap-2">
      <input type="hidden" name="jobId" value={jobId} />
      <input type="hidden" name="scheduleId" value={scheduleId} />
      <button
        type="submit"
        disabled={pending}
        className="rounded border px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
        style={{ borderColor: "var(--bt-border)", color: "var(--bt-text)" }}
        title="Capture today's computed dates as the baseline to compare future slippage against"
      >
        {pending ? "Snapshotting…" : hasBaseline ? "Re-snapshot baseline" : "Snapshot baseline"}
      </button>
      {state.error ? <p className="text-xs text-red-600">{state.error}</p> : null}
    </form>
  );
}
