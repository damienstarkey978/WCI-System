"use client";

import { useActionState, useState } from "react";

import { submitBidOnBehalfAction, type ActionState } from "./actions";

const INITIAL: ActionState = {};

/** Staff-entered bid — CLAUDE.md 3's "staff can edit on a vendor's behalf (a phone bid)". */
export function SubmitBidOnBehalfForm({ jobId, bidSubmissionId }: { jobId: string; bidSubmissionId: string }) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(submitBidOnBehalfAction, INITIAL);

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="text-xs font-medium text-[var(--bt-primary)] hover:underline">
        Enter bid (phone/email)
      </button>
    );
  }

  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="jobId" value={jobId} />
      <input type="hidden" name="bidSubmissionId" value={bidSubmissionId} />
      <input
        name="amount"
        inputMode="decimal"
        placeholder="0.00"
        required
        className="w-24 rounded border px-2 py-1 text-xs outline-none focus:border-[var(--bt-primary)]"
        style={{ borderColor: "var(--bt-border)" }}
      />
      <input
        name="notes"
        placeholder="Notes"
        className="w-32 rounded border px-2 py-1 text-xs outline-none focus:border-[var(--bt-primary)]"
        style={{ borderColor: "var(--bt-border)" }}
      />
      <button type="submit" disabled={pending} className="rounded px-2 py-1 text-xs font-semibold text-white disabled:opacity-50" style={{ background: "var(--bt-primary)" }}>
        {pending ? "Saving…" : "Save"}
      </button>
      <button type="button" onClick={() => setOpen(false)} className="text-xs text-[var(--bt-muted)] hover:underline">
        Cancel
      </button>
      {state.error ? <span className="w-full text-xs text-red-600">{state.error}</span> : null}
    </form>
  );
}
