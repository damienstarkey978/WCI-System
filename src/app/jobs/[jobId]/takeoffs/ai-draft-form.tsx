"use client";

import { useActionState } from "react";

import { draftTakeoffWithAiAction, type ActionState } from "./actions";

const INITIAL: ActionState = {};

export function AiDraftTakeoffForm({
  jobId,
  takeoffId,
  defaultNotes,
}: {
  jobId: string;
  /** When set, fills this empty takeoff (keeps attached plans) instead of creating a new one. */
  takeoffId?: string;
  defaultNotes?: string | null;
}) {
  const [state, formAction, pending] = useActionState(draftTakeoffWithAiAction, INITIAL);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="jobId" value={jobId} />
      {takeoffId ? <input type="hidden" name="takeoffId" value={takeoffId} /> : null}
      <label className="grid gap-1 text-sm">
        <span className="text-xs font-medium text-[var(--bt-muted)]">Plans / measurement notes</span>
        <textarea
          name="notes"
          required
          minLength={10}
          rows={8}
          defaultValue={defaultNotes ?? ""}
          placeholder="e.g. Main level LVP ~1,240 sf living + halls, 10% waste. Exterior stucco 2,100 sf walls. Framing lumber package per plans sheet A-3."
          className="min-h-[8rem] w-full rounded border px-3 py-2 text-sm outline-none focus:border-[var(--bt-primary)]"
          style={{ borderColor: "var(--bt-border)" }}
        />
      </label>
      <p className="text-xs text-[var(--bt-muted)]">
        {takeoffId
          ? "Drafts quantity lines onto this takeoff (plans stay attached). Review, then Send to Estimating or Push to PO."
          : "Drafts a takeoff against your cost codes. Review lines, then explicitly Send to Estimating or Push to PO — never automatic."}
      </p>
      {state.error ? (
        <p role="alert" className="text-xs text-red-600">
          {state.error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="self-start rounded px-4 py-2.5 text-sm font-semibold text-[var(--bt-on-primary)] disabled:opacity-50 sm:py-2"
        style={{ background: "var(--bt-primary)" }}
      >
        {pending ? "Drafting…" : takeoffId ? "Draft lines with AI" : "Draft takeoff with AI"}
      </button>
    </form>
  );
}
