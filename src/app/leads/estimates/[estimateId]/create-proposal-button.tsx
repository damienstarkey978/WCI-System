"use client";

import { useActionState } from "react";

import { createProposalFromEstimateAction, type ActionState } from "./actions";

const INITIAL: ActionState = {};

export function CreateProposalFromEstimateButton({
  estimateId,
  prominent = false,
  variant = "default",
}: {
  readonly estimateId: string;
  /** Handoff-style dark Convert CTA in the sticky chrome. */
  readonly prominent?: boolean;
  /** `dock` = full-width one-click CTA inside the Handy estimate card. */
  readonly variant?: "default" | "dock";
}) {
  const [state, formAction, pending] = useActionState(createProposalFromEstimateAction, INITIAL);
  const dock = variant === "dock";

  return (
    <form
      action={formAction}
      className={dock ? "mt-2 flex w-full flex-col gap-1" : "flex flex-col items-stretch gap-1 sm:items-end"}
    >
      <input type="hidden" name="estimateId" value={estimateId} />
      <button
        type="submit"
        disabled={pending}
        className={
          dock
            ? "inline-flex min-h-8 w-full touch-manipulation items-center justify-center rounded-md px-2 py-1.5 text-[11px] font-semibold text-[var(--bt-on-primary)] disabled:opacity-50"
            : prominent
              ? "inline-flex min-h-11 w-full touch-manipulation items-center justify-center gap-2 rounded-md px-5 py-2.5 text-sm font-semibold text-[var(--bt-on-primary)] shadow-sm disabled:opacity-50 sm:min-h-10 sm:w-auto"
              : "inline-flex min-h-11 touch-manipulation items-center justify-center gap-1.5 rounded-md px-4 py-2.5 text-sm font-semibold text-[var(--bt-on-primary)] disabled:opacity-50 sm:min-h-0 sm:py-2 sm:text-xs"
        }
        style={{ background: "var(--bt-primary)" }}
      >
        {pending ? "Converting…" : dock ? "Convert to proposal" : "Convert to Proposal"}
      </button>
      {state.error ? <p className="max-w-xs text-xs text-red-600">{state.error}</p> : null}
    </form>
  );
}
