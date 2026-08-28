"use client";

import { useActionState } from "react";

import { CostCodeLineItems, type CostCodeOption, type MaterialOption } from "@/components/financial/CostCodeLineItems";

import { createEstimateAction, type ActionState } from "./actions";

const INITIAL: ActionState = {};

export function CreateEstimateForm({
  jobId,
  costCodes,
  materials,
}: {
  jobId: string;
  costCodes: readonly CostCodeOption[];
  materials?: readonly MaterialOption[];
}) {
  const [state, formAction, pending] = useActionState(createEstimateAction, INITIAL);

  return (
    <form action={formAction} className="rounded-lg border bg-white p-4" style={{ borderColor: "var(--bt-border)" }}>
      <input type="hidden" name="jobId" value={jobId} />
      <h2 className="text-sm font-semibold text-[var(--bt-text)]">New estimate</h2>

      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <label className="grid gap-1 text-sm">
          <span className="text-xs font-medium text-[var(--bt-muted)]">Title</span>
          <input
            name="title"
            required
            className="rounded border px-3 py-2 text-sm outline-none focus:border-[var(--bt-primary)]"
            style={{ borderColor: "var(--bt-border)" }}
          />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="text-xs font-medium text-[var(--bt-muted)]">Rate mode</span>
          <select
            name="rateMode"
            defaultValue="MARKUP"
            className="rounded border px-3 py-2 text-sm outline-none focus:border-[var(--bt-primary)]"
            style={{ borderColor: "var(--bt-border)" }}
          >
            <option value="MARKUP">Markup</option>
            <option value="MARGIN">Margin</option>
          </select>
        </label>
        <label className="grid gap-1 text-sm">
          <span className="text-xs font-medium text-[var(--bt-muted)]">Default rate %</span>
          <input
            name="defaultRate"
            inputMode="decimal"
            placeholder="0"
            className="rounded border px-3 py-2 text-sm outline-none focus:border-[var(--bt-primary)]"
            style={{ borderColor: "var(--bt-border)" }}
          />
        </label>
      </div>

      <div className="mt-3">
        <CostCodeLineItems costCodes={costCodes} materials={materials} />
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
          {pending ? "Creating…" : "Create estimate"}
        </button>
      </div>
    </form>
  );
}
