"use client";

import { useActionState } from "react";

import { generateComparisonSummaryAction, type SummaryActionState } from "./actions";

const INITIAL: SummaryActionState = {};

export function AiComparisonSummary({ bidPackageId }: { bidPackageId: string }) {
  const [state, formAction, pending] = useActionState(generateComparisonSummaryAction, INITIAL);

  return (
    <div className="rounded-lg border bg-[var(--bt-panel-bg)] p-4" style={{ borderColor: "var(--bt-border)" }}>
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-[var(--bt-text)]">AI comparison summary</h2>
        <form action={formAction}>
          <input type="hidden" name="bidPackageId" value={bidPackageId} />
          <button
            type="submit"
            disabled={pending}
            className="rounded px-3 py-1.5 text-xs font-semibold text-[var(--bt-on-primary)] disabled:opacity-50"
            style={{ background: "var(--bt-primary)" }}
          >
            {pending ? "Generating…" : state.summary ? "Regenerate" : "Generate AI summary"}
          </button>
        </form>
      </div>

      {state.error ? (
        <p role="alert" className="mt-2 text-xs text-red-600">
          {state.error}
        </p>
      ) : null}
      {state.summary ? <p className="mt-2 text-sm whitespace-pre-wrap text-[var(--bt-text)]">{state.summary}</p> : null}
      {!state.summary && !state.error ? (
        <p className="mt-2 text-xs text-[var(--bt-muted)]">Not persisted — a fresh read over the current bids each time you generate it.</p>
      ) : null}
    </div>
  );
}
