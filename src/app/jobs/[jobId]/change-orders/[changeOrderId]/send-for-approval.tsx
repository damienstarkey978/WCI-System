"use client";

import { useActionState, useState } from "react";

import { sendChangeOrderForApprovalAction, type ActionState } from "../actions";

const INITIAL: ActionState = {};

/**
 * Working "Send to client for approval" — issues e-sign link, emails when possible,
 * always shows a copyable URL. No QuickBooks.
 */
export function SendChangeOrderForApproval({
  jobId,
  changeOrderId,
  status,
}: {
  jobId: string;
  changeOrderId: string;
  status: string;
}) {
  const [state, formAction, pending] = useActionState(sendChangeOrderForApprovalAction, INITIAL);
  const [copied, setCopied] = useState(false);

  if (status !== "DRAFT" && status !== "PENDING_APPROVAL" && !state.ok) {
    return null;
  }

  async function copyUrl(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      window.prompt("Copy approval link", url);
    }
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <form action={formAction}>
        <input type="hidden" name="jobId" value={jobId} />
        <input type="hidden" name="changeOrderId" value={changeOrderId} />
        <button
          type="submit"
          disabled={pending}
          className="rounded px-3 py-1.5 text-sm font-semibold text-[var(--bt-on-primary)] disabled:opacity-50"
          style={{ background: "var(--bt-primary)" }}
          title="Marks pending, issues client e-sign link, emails when configured. Does not push QuickBooks."
        >
          {pending ? "Sending…" : status === "PENDING_APPROVAL" ? "Resend approval link" : "Send to client"}
        </button>
      </form>
      {state.error && !state.approvalUrl ? <p className="max-w-xs text-right text-xs text-red-600">{state.error}</p> : null}
      {state.approvalUrl ? (
        <div className="max-w-md rounded border px-3 py-2 text-xs" style={{ borderColor: "var(--bt-border)" }}>
          <p className="font-medium text-[var(--bt-text)]">
            {state.emailed ? "Emailed to client." : "Approval link ready — share manually."}
          </p>
          {state.error ? <p className="mt-1 text-[var(--bt-muted)]">{state.error}</p> : null}
          <button
            type="button"
            onClick={() => void copyUrl(state.approvalUrl!)}
            className="mt-2 font-medium text-[var(--bt-primary)] hover:underline"
          >
            {copied ? "Copied" : "Copy approval link"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
