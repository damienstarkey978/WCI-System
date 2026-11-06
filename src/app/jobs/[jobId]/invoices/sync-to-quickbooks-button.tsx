"use client";

import { useActionState } from "react";

import { syncInvoiceToQuickBooksAction, type ActionState } from "./actions";

const INITIAL: ActionState = {};

export function SyncToQuickBooksButton({
  jobId,
  invoiceId,
  label,
  pushPaused = false,
}: {
  jobId: string;
  invoiceId: string;
  label: string;
  /** When true, Sync stays available but shows cutover pause copy; server still refuses. */
  pushPaused?: boolean;
}) {
  const [state, formAction, pending] = useActionState(syncInvoiceToQuickBooksAction, INITIAL);

  return (
    <form action={formAction} className="flex flex-col items-start gap-1">
      <input type="hidden" name="jobId" value={jobId} />
      <input type="hidden" name="invoiceId" value={invoiceId} />
      <button
        type="submit"
        disabled={pending}
        className="rounded px-2 py-1 text-xs font-semibold text-[var(--bt-on-primary)] disabled:opacity-50"
        style={{ background: "var(--bt-primary)" }}
      >
        {pending ? "Syncing…" : label}
      </button>
      {pushPaused ? (
        <p className="max-w-[18rem] text-[10px] leading-snug text-[var(--bt-muted)]">
          Paused — Buildertrend owns QB until cutover (`QBO_INVOICE_PUSH_ENABLED`).
        </p>
      ) : null}
      {state.error ? (
        <p role="alert" className="text-xs text-red-600">
          {state.error}
        </p>
      ) : null}
      {state.ok ? <span className="text-xs text-green-700">Synced.</span> : null}
    </form>
  );
}
