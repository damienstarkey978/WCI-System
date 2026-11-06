"use client";

import { useActionState, useEffect, useRef } from "react";

import { attachBillFilesAction, type BillActionState } from "./actions";

const INITIAL: BillActionState = {};

/** Document-rail Add — mirrors Buildertrend attach after the bill exists. */
export function AttachBillFiles({ jobId, billId }: { jobId: string; billId: string }) {
  const [state, formAction, pending] = useActionState(attachBillFilesAction, INITIAL);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok) formRef.current?.reset();
  }, [state.ok]);

  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="jobId" value={jobId} />
      <input type="hidden" name="billId" value={billId} />
      <input
        type="file"
        name="files"
        multiple
        accept="image/png,image/jpeg,image/gif,image/webp,application/pdf"
        className="block w-full text-[11px] text-[var(--bt-muted)] file:mr-2 file:rounded file:border file:px-2 file:py-1 file:text-[11px] file:font-semibold"
        style={{ borderColor: "var(--bt-border)" }}
      />
      {state.error ? (
        <p role="alert" className="text-[11px] text-red-600">
          {state.error}
        </p>
      ) : null}
      {state.ok ? <p className="text-[11px] text-[var(--bt-muted)]">Attached.</p> : null}
      <button
        type="submit"
        disabled={pending}
        className="self-start rounded border px-2.5 py-1 text-[11px] font-semibold text-[var(--bt-text)] hover:bg-black/5 disabled:opacity-50"
        style={{ borderColor: "var(--bt-border)" }}
      >
        {pending ? "Uploading…" : "Add"}
      </button>
    </form>
  );
}
