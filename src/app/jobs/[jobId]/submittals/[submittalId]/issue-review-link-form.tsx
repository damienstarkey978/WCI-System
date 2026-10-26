"use client";

import { useActionState } from "react";

import { issueSubmittalReviewLinkAction, type ActionState } from "../actions";

const INITIAL: ActionState = {};

export function IssueReviewLinkForm({ jobId, submittalId }: { jobId: string; submittalId: string }) {
  const [state, formAction, pending] = useActionState(issueSubmittalReviewLinkAction, INITIAL);

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="jobId" value={jobId} />
      <input type="hidden" name="submittalId" value={submittalId} />
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="grid gap-1 text-sm">
          <span className="text-xs font-medium text-[var(--bt-muted)]">Reviewer name</span>
          <input name="reviewerName" required className="rounded border px-3 py-2 text-sm" style={{ borderColor: "var(--bt-border)" }} />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="text-xs font-medium text-[var(--bt-muted)]">Reviewer email</span>
          <input name="reviewerEmail" type="email" required className="rounded border px-3 py-2 text-sm" style={{ borderColor: "var(--bt-border)" }} />
        </label>
      </div>
      {state.error ? <p className="text-xs text-red-600">{state.error}</p> : null}
      {state.reviewToken ? (
        <p className="break-all rounded border bg-[var(--bt-bg)] p-2 text-xs text-[var(--bt-text)]" style={{ borderColor: "var(--bt-border)" }}>
          Review token (copy now): {state.reviewToken}
        </p>
      ) : null}
      <button type="submit" disabled={pending} className="self-start rounded border px-3 py-1.5 text-xs font-semibold disabled:opacity-50" style={{ borderColor: "var(--bt-border)" }}>
        {pending ? "Issuing…" : "Issue review link"}
      </button>
    </form>
  );
}
