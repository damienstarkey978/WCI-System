"use client";

import { useActionState } from "react";

import { answerRfiAction, type ActionState } from "./actions";

const INITIAL: ActionState = {};

/** Always-visible answer composer for OPEN RFIs (BT Answer section chrome). */
export function AnswerRfiForm({ jobId, rfiId }: { jobId: string; rfiId: string }) {
  const [state, formAction, pending] = useActionState(answerRfiAction, INITIAL);

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="jobId" value={jobId} />
      <input type="hidden" name="rfiId" value={rfiId} />
      <textarea
        name="answer"
        required
        rows={4}
        placeholder="Write the answer…"
        className="rounded border px-3 py-2 text-sm outline-none focus:border-[var(--bt-primary)]"
        style={{ borderColor: "var(--bt-border)" }}
      />
      {state.error ? <p className="text-xs text-red-600">{state.error}</p> : null}
      <div className="flex justify-end gap-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded px-3 py-1.5 text-xs font-semibold text-[var(--bt-on-primary)] disabled:opacity-50"
          style={{ background: "var(--bt-primary)" }}
        >
          {pending ? "Saving…" : "Submit answer"}
        </button>
      </div>
    </form>
  );
}
