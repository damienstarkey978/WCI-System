"use client";

import { useActionState } from "react";

import { syncBillToQuickBooksAction, type ActionState } from "./actions";

const INITIAL: ActionState = {};

export function SyncToQuickBooksButton({ jobId, billId, label }: { jobId: string; billId: string; label: string }) {
  const [state, formAction, pending] = useActionState(syncBillToQuickBooksAction, INITIAL);

  return (
    <form action={formAction} className="flex flex-col items-end gap-1">
      <input type="hidden" name="jobId" value={jobId} />
      <input type="hidden" name="billId" value={billId} />
      <button type="submit" disabled={pending} className="text-xs font-medium text-[var(--bt-primary)] hover:underline disabled:opacity-50">
        {pending ? "Syncing…" : label}
      </button>
      {state.error ? (
        <p role="alert" className="max-w-[16rem] text-right text-xs text-red-600">
          {state.error}
        </p>
      ) : null}
      {state.ok ? <span className="text-xs text-green-700">Synced.</span> : null}
    </form>
  );
}
