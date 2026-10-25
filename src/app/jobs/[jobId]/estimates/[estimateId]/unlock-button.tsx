"use client";

import { useActionState } from "react";

import { unlockEstimateAction, type ActionState } from "../actions";

const INITIAL: ActionState = {};

/** Reopens a locked estimate as a new revision; the budget only changes when it is sent again. */
export function UnlockButton({ jobId, estimateId }: { jobId: string; estimateId: string }) {
  const [state, formAction, pending] = useActionState(unlockEstimateAction, INITIAL);

  return (
    <form
      action={formAction}
      onSubmit={(event) => {
        if (!window.confirm("Unlock this estimate to revise it? The job budget stays as it is until you update it again.")) event.preventDefault();
      }}
      className="flex items-center gap-2"
    >
      <input type="hidden" name="jobId" value={jobId} />
      <input type="hidden" name="estimateId" value={estimateId} />
      <button type="submit" disabled={pending} className="rounded border px-3 py-2 text-sm font-semibold disabled:opacity-50" style={{ borderColor: "var(--bt-border)", color: "var(--bt-text)" }}>
        {pending ? "Unlocking…" : "Unlock to revise"}
      </button>
      {state.error ? <span className="text-xs text-red-600">{state.error}</span> : null}
    </form>
  );
}
