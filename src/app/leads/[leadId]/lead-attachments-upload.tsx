"use client";

import { useActionState, useRef } from "react";

import { uploadLeadAttachmentsAction, type ActionState } from "./actions";

const INITIAL: ActionState = {};

export function LeadAttachmentsUpload({ leadId }: { leadId: string }) {
  const [state, formAction, pending] = useActionState(uploadLeadAttachmentsAction, INITIAL);
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form
      ref={formRef}
      action={async (formData) => {
        await formAction(formData);
        formRef.current?.reset();
      }}
      className="flex flex-wrap items-center gap-2"
    >
      <input type="hidden" name="leadId" value={leadId} />
      <input name="files" type="file" multiple required aria-label="Files to attach" className="text-sm" />
      <button
        type="submit"
        disabled={pending}
        className="rounded border px-3 py-1.5 text-sm font-semibold disabled:opacity-50"
        style={{ borderColor: "var(--bt-border)", color: "var(--bt-text)" }}
      >
        {pending ? "Uploading…" : "Add"}
      </button>
      {state.error ? <span className="text-xs text-red-600">{state.error}</span> : null}
    </form>
  );
}
