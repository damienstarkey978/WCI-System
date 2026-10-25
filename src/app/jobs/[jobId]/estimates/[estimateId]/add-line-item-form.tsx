"use client";

import { useActionState } from "react";

import { addJobEstimateLineItemAction, type ActionState } from "../actions";

const INITIAL: ActionState = {};
const FIELD = "rounded border px-2 py-1.5 text-sm outline-none focus:border-[var(--bt-primary)]";

export interface CostCodeOption {
  readonly id: string;
  readonly code: string;
  readonly name: string;
}

export function AddLineItemForm({ jobId, estimateId, costCodes }: { jobId: string; estimateId: string; costCodes: readonly CostCodeOption[] }) {
  const [state, formAction, pending] = useActionState(addJobEstimateLineItemAction, INITIAL);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="jobId" value={jobId} />
      <input type="hidden" name="estimateId" value={estimateId} />
      <select name="costCodeId" required defaultValue="" className={FIELD} style={{ borderColor: "var(--bt-border)" }}>
        <option value="" disabled>
          Cost code…
        </option>
        {costCodes.map((code) => (
          <option key={code.id} value={code.id}>
            {code.code} {code.name}
          </option>
        ))}
      </select>
      <input name="title" required placeholder="Item title" className={FIELD} style={{ borderColor: "var(--bt-border)" }} />
      <input name="groupLabel" placeholder="Group (optional)" className={FIELD} style={{ borderColor: "var(--bt-border)" }} />
      <div className="grid grid-cols-3 gap-2">
        <label className="flex flex-col gap-1 text-xs font-semibold text-[var(--bt-muted)]">
          Quantity
          <input name="quantity" defaultValue="1" inputMode="decimal" className={FIELD} style={{ borderColor: "var(--bt-border)" }} />
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold text-[var(--bt-muted)]">
          Unit cost ($)
          <input name="unitCost" defaultValue="0" inputMode="decimal" className={FIELD} style={{ borderColor: "var(--bt-border)" }} />
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold text-[var(--bt-muted)]">
          Rate (%)
          <input name="ratePercent" defaultValue="0" inputMode="decimal" className={FIELD} style={{ borderColor: "var(--bt-border)" }} />
        </label>
      </div>
      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending} className="rounded px-4 py-2 text-sm font-semibold text-[var(--bt-on-primary)] disabled:opacity-50" style={{ background: "var(--bt-primary)" }}>
          {pending ? "Adding…" : "Add line item"}
        </button>
        {state.ok ? <span className="text-xs text-[var(--bt-muted)]">Added.</span> : null}
        {state.error ? <span className="text-xs text-red-600">{state.error}</span> : null}
      </div>
    </form>
  );
}
