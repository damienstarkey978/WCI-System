"use client";

import { useActionState } from "react";

import { generateSpecFromEstimateAction, type ActionState } from "./actions";

const INITIAL: ActionState = {};

export interface EstimateOption {
  readonly id: string;
  readonly title: string;
}

export function GenerateSpecForm({ jobId, estimates }: { jobId: string; estimates: readonly EstimateOption[] }) {
  const [state, formAction, pending] = useActionState(generateSpecFromEstimateAction, INITIAL);

  return (
    <form action={formAction} className="rounded-lg border bg-[var(--bt-panel-bg)] p-4" style={{ borderColor: "var(--bt-border)" }}>
      <input type="hidden" name="jobId" value={jobId} />
      <h2 className="text-sm font-semibold text-[var(--bt-text)]">Generate from estimate</h2>
      <p className="mt-1 text-xs text-[var(--bt-muted)]">Builds one section per room/assembly group already on the estimate — nothing re-entered by hand.</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <label className="grid gap-1 text-sm">
          <span className="text-xs font-medium text-[var(--bt-muted)]">Title</span>
          <input name="title" required className="rounded border px-3 py-2 text-sm outline-none focus:border-[var(--bt-primary)]" style={{ borderColor: "var(--bt-border)" }} />
        </label>
        <label className="grid gap-1 text-sm sm:col-span-2">
          <span className="text-xs font-medium text-[var(--bt-muted)]">Estimate</span>
          <select name="estimateId" required defaultValue="" className="rounded border px-3 py-2 text-sm outline-none focus:border-[var(--bt-primary)]" style={{ borderColor: "var(--bt-border)" }}>
            <option value="" disabled>
              {estimates.length === 0 ? "No estimates on this job yet" : "Choose an estimate"}
            </option>
            {estimates.map((estimate) => (
              <option key={estimate.id} value={estimate.id}>
                {estimate.title}
              </option>
            ))}
          </select>
        </label>
      </div>
      {state.error ? (
        <p role="alert" className="mt-2 text-xs text-red-600">
          {state.error}
        </p>
      ) : null}
      <div className="mt-3">
        <button type="submit" disabled={pending || estimates.length === 0} className="rounded px-4 py-2 text-sm font-semibold text-[var(--bt-on-primary)] disabled:opacity-50" style={{ background: "var(--bt-primary)" }}>
          {pending ? "Generating…" : "Generate specification"}
        </button>
      </div>
    </form>
  );
}
