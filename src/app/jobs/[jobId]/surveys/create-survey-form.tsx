"use client";

import { useActionState } from "react";

import { createSurveyAction, type ActionState } from "./actions";
import { QuestionRows } from "./question-rows";

const INITIAL: ActionState = {};

export interface ClientOption {
  readonly id: string;
  readonly name: string;
}

export function CreateSurveyForm({ jobId, clients }: { jobId: string; clients: readonly ClientOption[] }) {
  const [state, formAction, pending] = useActionState(createSurveyAction, INITIAL);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="jobId" value={jobId} />

      <label className="grid gap-1 text-sm">
        <span className="text-xs font-medium text-[var(--bt-muted)]">Survey name</span>
        <input
          name="title"
          required
          placeholder="Customer Survey"
          className="rounded border px-3 py-2 text-base font-medium outline-none focus:border-[var(--bt-primary)]"
          style={{ borderColor: "var(--bt-border)" }}
        />
      </label>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1 text-sm">
          <span className="text-xs font-medium text-[var(--bt-muted)]">Touchpoint</span>
          <select name="touchpoint" defaultValue="POST_COMPLETION" className="rounded border px-3 py-2 text-sm" style={{ borderColor: "var(--bt-border)" }}>
            <option value="PRE_PROJECT">Pre-project</option>
            <option value="MID_PROJECT">Mid-project</option>
            <option value="POST_COMPLETION">Post-completion</option>
          </select>
        </label>
        <label className="grid gap-1 text-sm">
          <span className="text-xs font-medium text-[var(--bt-muted)]">Client</span>
          <select name="clientId" defaultValue="" className="rounded border px-3 py-2 text-sm" style={{ borderColor: "var(--bt-border)" }}>
            <option value="">None</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-sm sm:col-span-2">
          <span className="text-xs font-medium text-[var(--bt-muted)]">Release date</span>
          <input type="datetime-local" name="releaseAt" className="rounded border px-3 py-2 text-sm" style={{ borderColor: "var(--bt-border)" }} />
        </label>
      </div>

      <label className="grid gap-1 text-sm">
        <span className="text-xs font-medium text-[var(--bt-muted)]">Email invitation</span>
        <textarea
          name="invitationBody"
          rows={3}
          placeholder="Optional invitation copy. Links are issued as tokens; nothing is emailed yet."
          className="rounded border px-3 py-2 text-sm"
          style={{ borderColor: "var(--bt-border)" }}
        />
      </label>

      <div>
        <span className="text-xs font-medium text-[var(--bt-muted)]">Questions</span>
        <div className="mt-1">
          <QuestionRows />
        </div>
      </div>

      <p className="text-xs text-[var(--bt-muted)]">Save only. Issue a response link from the survey card (token returned, not emailed).</p>

      {state.error ? (
        <p role="alert" className="text-xs text-red-600">
          {state.error}
        </p>
      ) : null}

      <button type="submit" disabled={pending} className="self-end rounded px-4 py-2 text-sm font-semibold text-[var(--bt-on-primary)] disabled:opacity-50" style={{ background: "var(--bt-primary)" }}>
        {pending ? "Saving…" : "Save"}
      </button>
    </form>
  );
}
