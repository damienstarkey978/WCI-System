"use client";

import { useActionState } from "react";

import { createProposalFromEstimateAction, type ActionState } from "./actions";

const INITIAL: ActionState = {};

export function CreateProposalFromEstimateButton({
  estimateId,
  prominent = false,
}: {
  readonly estimateId: string;
  /** Handoff-style dark Convert CTA in the sticky chrome. */
  readonly prominent?: boolean;
}) {
  const [state, formAction, pending] = useActionState(createProposalFromEstimateAction, INITIAL);

  return (
    <form action={formAction} className="flex flex-col items-stretch gap-1 sm:items-end">
      <input type="hidden" name="estimateId" value={estimateId} />
      <button
        type="submit"
        disabled={pending}
        className={
          prominent
            ? "inline-flex min-h-11 w-full touch-manipulation items-center justify-center gap-2 rounded-md px-5 py-2.5 text-sm font-semibold text-[var(--bt-on-primary)] shadow-sm disabled:opacity-50 sm:min-h-10 sm:w-auto"
            : "inline-flex min-h-11 touch-manipulation items-center justify-center gap-1.5 rounded-md px-4 py-2.5 text-sm font-semibold text-[var(--bt-on-primary)] disabled:opacity-50 sm:min-h-0 sm:py-2 sm:text-xs"
        }
        style={{ background: "var(--bt-primary)" }}
      >
        {pending ? "Converting…" : "Convert to Proposal"}
        {!pending ? (
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden className="opacity-90">
            <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ) : null}
      </button>
      {state.error ? <p className="max-w-xs text-xs text-red-600">{state.error}</p> : null}
    </form>
  );
}
