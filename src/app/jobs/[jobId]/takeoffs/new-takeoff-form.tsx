"use client";

import { useActionState } from "react";

import { createBlankTakeoffAction, type ActionState } from "./actions";

const INITIAL: ActionState = {};

/** Creates a blank DRAFT takeoff so staff can attach plans and enter measurements first. */
export function NewTakeoffForm({ jobId }: { jobId: string }) {
  const [state, formAction, pending] = useActionState(createBlankTakeoffAction, INITIAL);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="jobId" value={jobId} />
      <label className="grid gap-1 text-sm">
        <span className="text-xs font-medium text-[var(--bt-muted)]">Title</span>
        <input
          name="title"
          placeholder="e.g. Main level flooring takeoff"
          className="w-full rounded border px-3 py-2 text-sm outline-none focus:border-[var(--bt-primary)]"
          style={{ borderColor: "var(--bt-border)" }}
        />
      </label>
      <label className="grid gap-1 text-sm">
        <span className="text-xs font-medium text-[var(--bt-muted)]">Measurements (optional)</span>
        <textarea
          name="notes"
          rows={5}
          placeholder="e.g. Living + halls LVP 1,240 sf + 10% waste. Kitchen tile 180 sf."
          className="min-h-[6rem] w-full rounded border px-3 py-2 text-sm outline-none focus:border-[var(--bt-primary)]"
          style={{ borderColor: "var(--bt-border)" }}
        />
      </label>
      <p className="text-xs text-[var(--bt-muted)]">
        Opens the takeoff so you can import plans from Plans &amp; Specs or upload drawings, then refine
        measurements before AI draft or hand lines.
      </p>
      {state.error ? (
        <p role="alert" className="text-xs text-red-600">
          {state.error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="self-start rounded px-4 py-2 text-sm font-semibold text-[var(--bt-on-primary)] disabled:opacity-50"
        style={{ background: "var(--bt-primary)" }}
      >
        {pending ? "Creating…" : "Create takeoff"}
      </button>
    </form>
  );
}
