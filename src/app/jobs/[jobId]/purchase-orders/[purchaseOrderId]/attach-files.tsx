"use client";

import { useActionState, useEffect, useRef } from "react";

import { attachPurchaseOrderFilesAction, type ActionState } from "../actions";

const INITIAL: ActionState = {};

/** Save-first Attachments seam — mirrors Buildertrend "Add" after the PO exists. */
export function AttachPurchaseOrderFiles({
  jobId,
  purchaseOrderId,
}: {
  jobId: string;
  purchaseOrderId: string;
}) {
  const [state, formAction, pending] = useActionState(attachPurchaseOrderFilesAction, INITIAL);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok) formRef.current?.reset();
  }, [state.ok]);

  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="jobId" value={jobId} />
      <input type="hidden" name="purchaseOrderId" value={purchaseOrderId} />
      <input
        type="file"
        name="files"
        multiple
        className="block w-full text-xs text-[var(--bt-muted)] file:mr-2 file:rounded file:border file:px-2 file:py-1 file:text-xs file:font-semibold"
        style={{ borderColor: "var(--bt-border)" }}
      />
      {state.error ? (
        <p role="alert" className="text-xs text-red-600">
          {state.error}
        </p>
      ) : null}
      {state.ok ? <p className="text-xs text-[var(--bt-muted)]">Attached.</p> : null}
      <button
        type="submit"
        disabled={pending}
        className="self-start rounded border px-3 py-1.5 text-xs font-semibold text-[var(--bt-text)] hover:bg-black/5 disabled:opacity-50"
        style={{ borderColor: "var(--bt-border)" }}
      >
        {pending ? "Uploading…" : "Add"}
      </button>
    </form>
  );
}
