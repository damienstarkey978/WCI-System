"use client";

import { useActionState } from "react";

import { createInspectionFolderAction, type ActionState } from "./actions";

const INITIAL: ActionState = {};

const TRADES = [
  { value: "BUILDING", label: "Building" },
  { value: "ELECTRICAL", label: "Electrical" },
  { value: "PLUMBING", label: "Plumbing" },
  { value: "MECHANICAL", label: "Mechanical" },
  { value: "ROOFING", label: "Roofing" },
] as const;

export function CreateInspectionFolderForm({ jobId }: { jobId: string }) {
  const [state, formAction, pending] = useActionState(createInspectionFolderAction, INITIAL);

  return (
    <form
      action={formAction}
      className="rounded-lg border bg-[var(--bt-panel-bg)] p-4"
      style={{ borderColor: "var(--bt-border)" }}
    >
      <input type="hidden" name="jobId" value={jobId} />
      <h2 className="text-sm font-semibold text-[var(--bt-text)]">Create inspection folder</h2>
      <p className="mt-1 text-xs text-[var(--bt-muted)]">
        Use the city inspection name (e.g. Slab, Electrical Rough). Creates the folder here — you do not
        need to open Permitting first.
      </p>
      <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_10rem_auto] sm:items-end">
        <label className="flex flex-col gap-1 text-xs font-semibold text-[var(--bt-muted)]">
          City inspection name
          <input
            name="name"
            required
            maxLength={120}
            placeholder="Slab"
            className="rounded border px-3 py-2 text-sm outline-none focus:border-[var(--bt-primary)]"
            style={{ borderColor: "var(--bt-border)" }}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold text-[var(--bt-muted)]">
          Trade
          <select
            name="trade"
            defaultValue=""
            className="rounded border px-3 py-2 text-sm outline-none focus:border-[var(--bt-primary)]"
            style={{ borderColor: "var(--bt-border)" }}
          >
            <option value="">Auto</option>
            {TRADES.map((trade) => (
              <option key={trade.value} value={trade.value}>
                {trade.label}
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          disabled={pending}
          className="rounded px-4 py-2 text-sm font-semibold text-[var(--bt-on-primary)] disabled:opacity-50"
          style={{ background: "var(--bt-primary)" }}
        >
          {pending ? "Creating…" : "Create folder"}
        </button>
      </div>
      {state.ok ? <p className="mt-2 text-xs text-[var(--bt-muted)]">Folder ready.</p> : null}
      {state.error ? <p className="mt-2 text-xs text-red-600">{state.error}</p> : null}
    </form>
  );
}
