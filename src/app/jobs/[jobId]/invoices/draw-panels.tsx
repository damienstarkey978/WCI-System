"use client";

import { useActionState, useState } from "react";

import { createDrawScheduleAction, generateDrawInvoiceAction, type ActionState } from "./draw-actions";

const INITIAL: ActionState = {};

const PRIMARY = "rounded px-3 py-1.5 text-xs font-semibold text-[var(--bt-on-primary)] disabled:opacity-50";
const FIELD = "rounded border px-2 py-1.5 text-xs outline-none focus:border-[var(--bt-primary)]";

function Err({ state }: { state: ActionState }) {
  if (!state.error) return null;
  return (
    <p role="alert" className="mt-1 text-xs" style={{ color: "var(--bt-danger)" }}>
      {state.error}
    </p>
  );
}

/**
 * Build a draw schedule. Percentages are shown adding up as they are typed, because
 * the failure this prevents — a schedule that bills 105% or 90% of the contract —
 * is otherwise invisible until the last draw is invoiced.
 */
export function CreateDrawScheduleForm({ jobId }: { jobId: string }) {
  const [state, action, pending] = useActionState(createDrawScheduleAction, INITIAL);
  const [rows, setRows] = useState([
    { title: "Deposit", percent: "10" },
    { title: "Rough-in complete", percent: "40" },
    { title: "Substantial completion", percent: "40" },
    { title: "Final", percent: "10" },
  ]);

  const total = rows.reduce((sum, row) => sum + (Number.parseFloat(row.percent) || 0), 0);
  const rounded = Math.round(total * 100) / 100;

  const update = (index: number, patch: Partial<{ title: string; percent: string }>) =>
    setRows((current) => current.map((row, i) => (i === index ? { ...row, ...patch } : row)));

  return (
    <form action={action} className="flex flex-col gap-3 rounded-lg border bg-[var(--bt-panel-bg)] p-4" style={{ borderColor: "var(--bt-border)" }}>
      <input type="hidden" name="jobId" value={jobId} />
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-xs text-[var(--bt-muted)]">
          Schedule name
          <input name="name" defaultValue="Draw Schedule" className={FIELD} style={{ borderColor: "var(--bt-border)" }} />
        </label>
      </div>

      <div className="flex flex-col gap-2">
        {rows.map((row, index) => (
          <div key={index} className="flex flex-wrap items-end gap-2">
            <label className="flex min-w-40 flex-1 flex-col gap-1 text-xs text-[var(--bt-muted)]">
              Draw
              <input
                name="drawTitle"
                value={row.title}
                onChange={(event) => update(index, { title: event.target.value })}
                className={FIELD}
                style={{ borderColor: "var(--bt-border)" }}
              />
            </label>
            <label className="flex w-24 flex-col gap-1 text-xs text-[var(--bt-muted)]">
              % of contract
              <input
                name="drawPercent"
                value={row.percent}
                inputMode="decimal"
                onChange={(event) => update(index, { percent: event.target.value })}
                className={FIELD}
                style={{ borderColor: "var(--bt-border)" }}
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-[var(--bt-muted)]">
              Bill on (optional)
              <input name="drawDate" type="date" className={FIELD} style={{ borderColor: "var(--bt-border)" }} />
            </label>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => setRows((current) => [...current, { title: "", percent: "" }])}
          className="text-xs font-medium hover:underline"
          style={{ color: "var(--bt-primary)" }}
        >
          Add a draw
        </button>
        <span
          className="text-xs font-semibold"
          style={{ color: rounded > 100 ? "var(--bt-danger)" : rounded === 100 ? "var(--bt-success)" : "var(--bt-muted)" }}
        >
          {rounded}% of the contract allocated
          {rounded > 100 ? " — over" : rounded < 100 ? ` — ${Math.round((100 - rounded) * 100) / 100}% unallocated` : ""}
        </span>
        <button type="submit" disabled={pending} className={PRIMARY} style={{ background: "var(--bt-primary)" }}>
          {pending ? "Saving…" : "Save schedule"}
        </button>
      </div>
      <Err state={state} />
    </form>
  );
}

export function GenerateDrawInvoiceButton({ jobId, drawId }: { jobId: string; drawId: string }) {
  const [state, action, pending] = useActionState(generateDrawInvoiceAction, INITIAL);
  return (
    <form action={action}>
      <input type="hidden" name="jobId" value={jobId} />
      <input type="hidden" name="drawId" value={drawId} />
      <button type="submit" disabled={pending} className={PRIMARY} style={{ background: "var(--bt-primary)" }}>
        {pending ? "Generating…" : "Generate invoice"}
      </button>
      <Err state={state} />
    </form>
  );
}
