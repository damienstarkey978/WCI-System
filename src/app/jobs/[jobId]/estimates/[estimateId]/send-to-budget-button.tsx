"use client";

import { useActionState } from "react";

import { sendEstimateToBudgetAction, type ActionState } from "../actions";

const INITIAL: ActionState = {};

/** Locks the estimate and writes the job budget from it (CLAUDE.md 2.3), so it asks first. */
export function SendToBudgetButton({ jobId, estimateId }: { jobId: string; estimateId: string }) {
  const [state, formAction, pending] = useActionState(sendEstimateToBudgetAction, INITIAL);

  return (
    <form
      action={formAction}
      onSubmit={(event) => {
        if (!window.confirm("Send this estimate to the job budget? This locks the estimate.")) event.preventDefault();
      }}
      className="flex items-center gap-2"
    >
      <input type="hidden" name="jobId" value={jobId} />
      <input type="hidden" name="estimateId" value={estimateId} />
      <button type="submit" disabled={pending} className="rounded border px-3 py-2 text-sm font-semibold disabled:opacity-50" style={{ borderColor: "var(--bt-border)", color: "var(--bt-text)" }}>
        {pending ? "Sending…" : "Send to job budget"}
      </button>
      {state.error ? <span className="text-xs text-red-600">{state.error}</span> : null}
    </form>
  );
}
