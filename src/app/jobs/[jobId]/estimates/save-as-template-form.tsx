"use client";

import { useActionState, useRef } from "react";

import { saveEstimateAsTemplateAction, type ActionState } from "./actions";

const INITIAL: ActionState = {};

export function SaveAsTemplateForm({ jobId, estimateId }: { jobId: string; estimateId: string }) {
  const [state, formAction, pending] = useActionState(saveEstimateAsTemplateAction, INITIAL);
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form
      ref={formRef}
      action={async (formData) => {
        await formAction(formData);
        formRef.current?.reset();
      }}
      className="flex items-center gap-1.5"
    >
      <input type="hidden" name="jobId" value={jobId} />
      <input type="hidden" name="estimateId" value={estimateId} />
      <input
        name="name"
        placeholder="Template name"
        className="w-32 rounded border px-2 py-1 text-xs outline-none focus:border-[var(--bt-primary)]"
        style={{ borderColor: "var(--bt-border)" }}
      />
      <button type="submit" disabled={pending} className="whitespace-nowrap text-xs font-semibold text-[var(--bt-primary)] hover:underline disabled:opacity-50">
        {pending ? "Saving…" : state.ok ? "Saved" : "Save as template"}
      </button>
      {state.error ? <span className="text-xs text-red-600">{state.error}</span> : null}
    </form>
  );
}
