"use client";

import { useActionState, useRef } from "react";

import { createDailyLogAction, type ActionState } from "./actions";

const INITIAL: ActionState = {};

export function DailyLogForm({ jobId }: { jobId: string }) {
  const [state, formAction, pending] = useActionState(createDailyLogAction, INITIAL);
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form
      ref={formRef}
      action={async (formData) => {
        await formAction(formData);
        formRef.current?.reset();
      }}
      className="rounded-lg border bg-white p-4"
      style={{ borderColor: "var(--bt-border)" }}
    >
      <input type="hidden" name="jobId" value={jobId} />
      <label className="grid gap-1 text-sm">
        <span className="text-xs font-medium text-[var(--bt-muted)]">New daily log</span>
        <textarea
          name="note"
          required
          rows={3}
          placeholder="What happened on site today?"
          className="w-full rounded border px-3 py-2 text-sm outline-none focus:border-[var(--bt-primary)]"
          style={{ borderColor: "var(--bt-border)" }}
        />
      </label>

      <div className="mt-2 flex flex-wrap items-center gap-4 text-xs text-[var(--bt-muted)]">
        <label className="flex items-center gap-1.5">
          <input type="checkbox" name="clientVisible" defaultChecked />
          Visible to client
        </label>
        <label className="flex items-center gap-1.5">
          <input type="checkbox" name="subVisible" defaultChecked />
          Visible to subs
        </label>
      </div>

      {state.error ? (
        <p role="alert" className="mt-2 text-xs text-red-600">
          {state.error}
        </p>
      ) : null}

      <div className="mt-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          style={{ background: "var(--bt-primary)" }}
        >
          {pending ? "Saving…" : "Add log"}
        </button>
      </div>
    </form>
  );
}
