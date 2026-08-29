"use client";

import { useActionState } from "react";

import { issueReviewLinkAction, type ActionState } from "./actions";

const INITIAL: ActionState = {};

/** No email provider configured yet — the raw link is shown once to copy and send manually. */
export function ReviewLinkButton({ proposalId }: { proposalId: string }) {
  const [state, formAction, pending] = useActionState(issueReviewLinkAction, INITIAL);

  return (
    <form action={formAction}>
      <input type="hidden" name="proposalId" value={proposalId} />
      <button type="submit" disabled={pending} className="rounded border px-3 py-1.5 text-xs font-medium text-[var(--bt-text)]" style={{ borderColor: "var(--bt-border)" }}>
        {pending ? "Issuing…" : "Get client review link"}
      </button>
      {state.error ? (
        <p role="alert" className="mt-2 text-xs text-red-600">
          {state.error}
        </p>
      ) : null}
      {state.reviewUrl ? (
        <div className="mt-2 rounded border bg-[var(--bt-page-bg)] p-2 text-xs" style={{ borderColor: "var(--bt-border)" }}>
          <p className="text-[var(--bt-muted)]">Copy this link and send it to the client — it won&apos;t be shown again:</p>
          <code className="mt-1 block break-all text-[var(--bt-text)]">{state.reviewUrl}</code>
        </div>
      ) : null}
    </form>
  );
}
