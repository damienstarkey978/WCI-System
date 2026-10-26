"use client";

import { useActionState, useRef } from "react";

import { createTodoAction, type ActionState } from "./actions";

const INITIAL: ActionState = {};

/** Buildertrend-style inline quick add at the bottom of the Tasks list. */
export function QuickAddTask({ jobId }: { jobId: string }) {
  const [state, formAction, pending] = useActionState(createTodoAction, INITIAL);
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form
      ref={formRef}
      action={async (formData) => {
        await formAction(formData);
        formRef.current?.reset();
      }}
      className="flex items-center gap-2 rounded-lg border px-3 py-2"
      style={{ borderColor: "var(--bt-border)", background: "var(--bt-panel-bg)" }}
    >
      <input type="hidden" name="jobId" value={jobId} />
      <input
        name="title"
        required
        placeholder="Add a task…"
        className="flex-1 border-0 bg-transparent text-sm outline-none"
      />
      <button type="submit" disabled={pending} className="text-sm font-semibold text-[var(--bt-primary)] hover:underline disabled:opacity-50">
        {pending ? "Adding…" : "Add"}
      </button>
      {state.error ? <span className="text-xs text-red-600">{state.error}</span> : null}
    </form>
  );
}
