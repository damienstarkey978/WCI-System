"use client";

import { useActionState, useState } from "react";

import { updateLeadDetailsAction, type ActionState } from "../actions";

const INITIAL: ActionState = {};

function toDateInputValue(date: Date | null): string {
  if (!date) return "";
  return date.toISOString().slice(0, 10);
}

export function LeadDetailsForm({
  leadId,
  confidencePercent,
  projectedSalesDate,
  estimatedRevenueMinCents,
  estimatedRevenueMaxCents,
  projectType,
  tags,
}: {
  leadId: string;
  confidencePercent: number;
  projectedSalesDate: Date | null;
  estimatedRevenueMinCents: number | null;
  estimatedRevenueMaxCents: number | null;
  projectType: string | null;
  tags: readonly string[];
}) {
  const [state, formAction, pending] = useActionState(updateLeadDetailsAction, INITIAL);
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="mt-3 text-xs font-medium text-[var(--bt-primary)] hover:underline">
        Edit opportunity details
      </button>
    );
  }

  return (
    <form action={formAction} className="mt-3 flex flex-col gap-3 border-t pt-3" style={{ borderColor: "var(--bt-border)" }}>
      <input type="hidden" name="leadId" value={leadId} />
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="grid gap-1 text-xs">
          <span className="font-medium text-[var(--bt-muted)]">Confidence %</span>
          <input
            name="confidencePercent"
            type="number"
            min={0}
            max={100}
            defaultValue={confidencePercent}
            className="rounded border px-3 py-2 text-sm outline-none focus:border-[var(--bt-primary)]"
            style={{ borderColor: "var(--bt-border)" }}
          />
        </label>
        <label className="grid gap-1 text-xs">
          <span className="font-medium text-[var(--bt-muted)]">Projected sales date</span>
          <input
            name="projectedSalesDate"
            type="date"
            defaultValue={toDateInputValue(projectedSalesDate)}
            className="rounded border px-3 py-2 text-sm outline-none focus:border-[var(--bt-primary)]"
            style={{ borderColor: "var(--bt-border)" }}
          />
        </label>
        <label className="grid gap-1 text-xs">
          <span className="font-medium text-[var(--bt-muted)]">Project type</span>
          <input
            name="projectType"
            defaultValue={projectType ?? ""}
            className="rounded border px-3 py-2 text-sm outline-none focus:border-[var(--bt-primary)]"
            style={{ borderColor: "var(--bt-border)" }}
          />
        </label>
        <label className="grid gap-1 text-xs">
          <span className="font-medium text-[var(--bt-muted)]">Est. revenue min</span>
          <input
            name="estimatedRevenueMin"
            inputMode="decimal"
            defaultValue={estimatedRevenueMinCents !== null ? (estimatedRevenueMinCents / 100).toFixed(2) : ""}
            className="rounded border px-3 py-2 text-sm outline-none focus:border-[var(--bt-primary)]"
            style={{ borderColor: "var(--bt-border)" }}
          />
        </label>
        <label className="grid gap-1 text-xs">
          <span className="font-medium text-[var(--bt-muted)]">Est. revenue max</span>
          <input
            name="estimatedRevenueMax"
            inputMode="decimal"
            defaultValue={estimatedRevenueMaxCents !== null ? (estimatedRevenueMaxCents / 100).toFixed(2) : ""}
            className="rounded border px-3 py-2 text-sm outline-none focus:border-[var(--bt-primary)]"
            style={{ borderColor: "var(--bt-border)" }}
          />
        </label>
        <label className="grid gap-1 text-xs">
          <span className="font-medium text-[var(--bt-muted)]">Tags</span>
          <input
            name="tags"
            placeholder="comma, separated"
            defaultValue={tags.join(", ")}
            className="rounded border px-3 py-2 text-sm outline-none focus:border-[var(--bt-primary)]"
            style={{ borderColor: "var(--bt-border)" }}
          />
        </label>
      </div>

      {state.error ? <p className="text-xs text-red-600">{state.error}</p> : null}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
          style={{ background: "var(--bt-primary)" }}
        >
          {pending ? "Saving…" : "Save"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="text-xs text-[var(--bt-muted)] hover:underline">
          Cancel
        </button>
      </div>
    </form>
  );
}
