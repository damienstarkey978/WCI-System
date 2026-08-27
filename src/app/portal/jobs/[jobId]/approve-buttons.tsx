"use client";

import { useActionState } from "react";

import { approveChangeOrderAction, approveSelectionOptionAction, type ActionState } from "./actions";

const INITIAL: ActionState = {};

export function ApproveChangeOrderButton({ jobId, changeOrderId }: { jobId: string; changeOrderId: string }) {
  const [state, formAction, pending] = useActionState(approveChangeOrderAction, INITIAL);

  return (
    <form action={formAction} className="flex flex-col items-end gap-1">
      <input type="hidden" name="jobId" value={jobId} />
      <input type="hidden" name="changeOrderId" value={changeOrderId} />
      <button
        type="submit"
        disabled={pending}
        className="rounded px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
        style={{ background: "var(--bt-primary)" }}
      >
        {pending ? "Approving…" : "Approve"}
      </button>
      {state.error ? <p className="text-xs text-red-600">{state.error}</p> : null}
    </form>
  );
}

export function ApproveSelectionOptionButton({
  jobId,
  selectionId,
  optionId,
}: {
  jobId: string;
  selectionId: string;
  optionId: string;
}) {
  const [state, formAction, pending] = useActionState(approveSelectionOptionAction, INITIAL);

  return (
    <form action={formAction} className="flex flex-col items-end gap-1">
      <input type="hidden" name="jobId" value={jobId} />
      <input type="hidden" name="selectionId" value={selectionId} />
      <input type="hidden" name="optionId" value={optionId} />
      <button
        type="submit"
        disabled={pending}
        className="rounded px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
        style={{ background: "var(--bt-primary)" }}
      >
        {pending ? "Approving…" : "Choose this option"}
      </button>
      {state.error ? <p className="text-xs text-red-600">{state.error}</p> : null}
    </form>
  );
}
