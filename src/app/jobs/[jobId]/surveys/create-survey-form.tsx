"use client";

import { useActionState } from "react";

import { createSurveyAction, type ActionState } from "./actions";
import { QuestionRows } from "./question-rows";

const INITIAL: ActionState = {};

export function CreateSurveyForm({ jobId }: { jobId: string }) {
  const [state, formAction, pending] = useActionState(createSurveyAction, INITIAL);

  return (
    <form action={formAction} className="rounded-lg border bg-[var(--bt-panel-bg)] p-4" style={{ borderColor: "var(--bt-border)" }}>
      <input type="hidden" name="jobId" value={jobId} />
      <h2 className="text-sm font-semibold text-[var(--bt-text)]">New survey</h2>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1 text-sm">
          <span className="text-xs font-medium text-[var(--bt-muted)]">Title</span>
          <input name="title" required className="rounded border px-3 py-2 text-sm outline-none focus:border-[var(--bt-primary)]" style={{ borderColor: "var(--bt-border)" }} />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="text-xs font-medium text-[var(--bt-muted)]">Touchpoint</span>
          <select name="touchpoint" defaultValue="POST_COMPLETION" className="rounded border px-3 py-2 text-sm outline-none focus:border-[var(--bt-primary)]" style={{ borderColor: "var(--bt-border)" }}>
            <option value="PRE_PROJECT">Pre-project</option>
            <option value="MID_PROJECT">Mid-project</option>
            <option value="POST_COMPLETION">Post-completion</option>
          </select>
        </label>
      </div>
      <div className="mt-3">
        <QuestionRows />
      </div>
      {state.error ? (
        <p role="alert" className="mt-2 text-xs text-red-600">
          {state.error}
        </p>
      ) : null}
      <div className="mt-3">
        <button type="submit" disabled={pending} className="rounded px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" style={{ background: "var(--bt-primary)" }}>
          {pending ? "Creating…" : "Create survey"}
        </button>
      </div>
    </form>
  );
}
