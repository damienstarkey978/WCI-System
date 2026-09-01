"use client";

import { useActionState, useState } from "react";

import { CostCodeLineItems, type CostCodeOption } from "@/components/financial/CostCodeLineItems";

import { createChangeOrderAction, type ActionState } from "./actions";

const INITIAL: ActionState = {};

export function CreateChangeOrderForm({ jobId, costCodes }: { jobId: string; costCodes: readonly CostCodeOption[] }) {
  const [state, formAction, pending] = useActionState(createChangeOrderAction, INITIAL);
  const [mode, setMode] = useState<"FLAT" | "ITEMIZED">("FLAT");

  return (
    <form action={formAction} className="rounded-lg border bg-[var(--bt-panel-bg)] p-4" style={{ borderColor: "var(--bt-border)" }}>
      <input type="hidden" name="jobId" value={jobId} />
      <h2 className="text-sm font-semibold text-[var(--bt-text)]">New change order</h2>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1 text-sm">
          <span className="text-xs font-medium text-[var(--bt-muted)]">Title</span>
          <input name="title" required className="rounded border px-3 py-2 text-sm outline-none focus:border-[var(--bt-primary)]" style={{ borderColor: "var(--bt-border)" }} />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="text-xs font-medium text-[var(--bt-muted)]">Mode</span>
          <select
            name="mode"
            value={mode}
            onChange={(event) => setMode(event.target.value as "FLAT" | "ITEMIZED")}
            className="rounded border px-3 py-2 text-sm outline-none focus:border-[var(--bt-primary)]"
            style={{ borderColor: "var(--bt-border)" }}
          >
            <option value="FLAT">Flat</option>
            <option value="ITEMIZED">Itemized</option>
          </select>
        </label>
      </div>

      {mode === "FLAT" ? (
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <label className="grid gap-1 text-sm">
            <span className="text-xs font-medium text-[var(--bt-muted)]">Cost code</span>
            <select name="flatCostCodeId" required defaultValue="" className="rounded border px-3 py-2 text-sm outline-none focus:border-[var(--bt-primary)]" style={{ borderColor: "var(--bt-border)" }}>
              <option value="" disabled>
                Choose
              </option>
              {costCodes.map((code) => (
                <option key={code.id} value={code.id}>
                  {code.code} — {code.name}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-sm">
            <span className="text-xs font-medium text-[var(--bt-muted)]">Cost</span>
            <input name="flatCost" inputMode="decimal" placeholder="0.00" className="rounded border px-3 py-2 text-sm outline-none focus:border-[var(--bt-primary)]" style={{ borderColor: "var(--bt-border)" }} />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="text-xs font-medium text-[var(--bt-muted)]">Client price</span>
            <input name="flatClientPrice" inputMode="decimal" placeholder="0.00" className="rounded border px-3 py-2 text-sm outline-none focus:border-[var(--bt-primary)]" style={{ borderColor: "var(--bt-border)" }} />
          </label>
        </div>
      ) : (
        <>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1 text-sm">
              <span className="text-xs font-medium text-[var(--bt-muted)]">Rate mode</span>
              <select name="rateMode" defaultValue="MARKUP" className="rounded border px-3 py-2 text-sm outline-none focus:border-[var(--bt-primary)]" style={{ borderColor: "var(--bt-border)" }}>
                <option value="MARKUP">Markup</option>
                <option value="MARGIN">Margin</option>
              </select>
            </label>
            <label className="grid gap-1 text-sm">
              <span className="text-xs font-medium text-[var(--bt-muted)]">Rate %</span>
              <input name="rate" inputMode="decimal" placeholder="0" className="rounded border px-3 py-2 text-sm outline-none focus:border-[var(--bt-primary)]" style={{ borderColor: "var(--bt-border)" }} />
            </label>
          </div>
          <div className="mt-3">
            <CostCodeLineItems costCodes={costCodes} />
          </div>
        </>
      )}

      {state.error ? (
        <p role="alert" className="mt-2 text-xs text-red-600">
          {state.error}
        </p>
      ) : null}

      <div className="mt-3">
        <button type="submit" disabled={pending} className="rounded px-4 py-2 text-sm font-semibold text-[var(--bt-on-primary)] disabled:opacity-50" style={{ background: "var(--bt-primary)" }}>
          {pending ? "Creating…" : "Create change order"}
        </button>
      </div>
    </form>
  );
}
