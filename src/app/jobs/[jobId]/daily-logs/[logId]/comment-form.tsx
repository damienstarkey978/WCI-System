"use client";

import { useActionState, useRef } from "react";

import { addDailyLogCommentAction, type ActionState } from "../actions";

const INITIAL: ActionState = {};

export function LogCommentForm({ jobId, logId }: { jobId: string; logId: string }) {
  const [state, formAction, pending] = useActionState(addDailyLogCommentAction, INITIAL);
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form
      ref={formRef}
      action={async (formData) => {
        await formAction(formData);
        formRef.current?.reset();
      }}
      className="flex items-end gap-2"
    >
      <input type="hidden" name="jobId" value={jobId} />
      <input type="hidden" name="logId" value={logId} />
      <textarea name="body" required rows={2} placeholder="Add a comment…" className="flex-1 rounded border px-3 py-2 text-sm outline-none focus:border-[var(--bt-primary)]" style={{ borderColor: "var(--bt-border)" }} />
      <button type="submit" disabled={pending} className="rounded px-4 py-2 text-sm font-semibold text-[var(--bt-on-primary)] disabled:opacity-50" style={{ background: "var(--bt-primary)" }}>
        {pending ? "Posting…" : "Comment"}
      </button>
      {state.error ? <span className="text-xs text-red-600">{state.error}</span> : null}
    </form>
  );
}
