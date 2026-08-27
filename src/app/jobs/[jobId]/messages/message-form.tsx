"use client";

import { useActionState, useRef } from "react";

import { postJobMessageAction, type ActionState } from "./actions";

const INITIAL: ActionState = {};

export function MessageForm({ jobId }: { jobId: string }) {
  const [state, formAction, pending] = useActionState(postJobMessageAction, INITIAL);
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form
      ref={formRef}
      action={async (formData) => {
        await formAction(formData);
        formRef.current?.reset();
      }}
      className="flex items-end gap-2 border-t px-4 py-3"
      style={{ borderColor: "var(--bt-border)" }}
    >
      <input type="hidden" name="jobId" value={jobId} />
      <textarea
        name="body"
        required
        rows={2}
        placeholder="Write a message…"
        className="flex-1 rounded border px-3 py-2 text-sm outline-none focus:border-[var(--bt-primary)]"
        style={{ borderColor: "var(--bt-border)" }}
      />
      <button
        type="submit"
        disabled={pending}
        className="rounded px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        style={{ background: "var(--bt-primary)" }}
      >
        {pending ? "Sending…" : "Send"}
      </button>
      {state.error ? <p className="text-xs text-red-600">{state.error}</p> : null}
    </form>
  );
}
