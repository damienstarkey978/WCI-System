"use client";

import { useActionState, useState } from "react";

import { answerRfiAction, type ActionState } from "./actions";

const INITIAL: ActionState = {};

export function AnswerRfiForm({ jobId, rfiId }: { jobId: string; rfiId: string }) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(answerRfiAction, INITIAL);

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="text-xs font-medium text-[var(--bt-primary)] hover:underline">
        Answer
      </button>
    );
  }

  return (
    <form action={formAction} className="mt-2 flex flex-col gap-2">
      <input type="hidden" name="jobId" value={jobId} />
      <input type="hidden" name="rfiId" value={rfiId} />
      <textarea
        name="answer"
        required
        rows={2}
        placeholder="Answer…"
        className="rounded border px-3 py-2 text-sm outline-none focus:border-[var(--bt-primary)]"
        style={{ borderColor: "var(--bt-border)" }}
      />
      {state.error ? <p className="text-xs text-red-600">{state.error}</p> : null}
      <div className="flex gap-2">
        <button type="submit" disabled={pending} className="rounded px-3 py-1.5 text-xs font-semibold text-[var(--bt-on-primary)] disabled:opacity-50" style={{ background: "var(--bt-primary)" }}>
          {pending ? "Saving…" : "Submit answer"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="text-xs text-[var(--bt-muted)] hover:underline">
          Cancel
        </button>
      </div>
    </form>
  );
}
