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
        className="min-h-11 touch-manipulation rounded px-4 py-2.5 text-sm font-semibold text-[var(--bt-on-primary)] disabled:opacity-50 sm:min-h-0 sm:py-1.5 sm:text-xs"
        style={{ background: "var(--bt-primary)" }}
      >
        {pending ? "Creating…" : "Create Proposal"}
      </button>
      {state.error ? <p className="max-w-xs text-xs text-red-600">{state.error}</p> : null}
    </form>
  );
}
