"use client";

import { useActionState } from "react";

import { createProposalFromEstimateAction, type ActionState } from "./actions";

const INITIAL: ActionState = {};

export function CreateProposalFromEstimateButton({ estimateId }: { readonly estimateId: string }) {
  const [state, formAction, pending] = useActionState(createProposalFromEstimateAction, INITIAL);

  return (
    <form action={formAction} className="flex flex-col items-stretch gap-1 sm:items-end">
      <input type="hidden" name="estimateId" value={estimateId} />
      <button
        type="submit"
        disabled={pending}
        className="inline-flex min-h-11 touch-manipulation items-center justify-center gap-1.5 rounded px-4 py-2.5 text-sm font-semibold text-[var(--bt-on-primary)] disabled:opacity-50 sm:min-h-0 sm:py-2 sm:text-xs"
        style={{ background: "var(--bt-primary)" }}
      >
        {pending ? "Converting…" : "Convert to Proposal"}
        {!pending ? <span aria-hidden className="text-[10px] opacity-80">▾</span> : null}
      </button>
      {state.error ? <p className="max-w-xs text-xs text-red-600">{state.error}</p> : null}
    </form>
  );
}
