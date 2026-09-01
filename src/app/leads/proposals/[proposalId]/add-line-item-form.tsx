"use client";

import { useActionState } from "react";

import { addLineItemAction, type ActionState } from "./actions";

const INITIAL: ActionState = {};

export interface CostCodeOption {
  readonly id: string;
  readonly code: string;
  readonly name: string;
}

export function AddLineItemForm({
  proposalId,
  estimateId,
  costCodes,
  defaultGroupLabel,
}: {
  proposalId: string;
  estimateId: string;
  costCodes: readonly CostCodeOption[];
  defaultGroupLabel?: string;
}) {
  const [state, formAction, pending] = useActionState(addLineItemAction, INITIAL);

  return (
    <form action={formAction} className="mt-2 flex flex-wrap items-center gap-2 rounded border border-dashed p-2" style={{ borderColor: "var(--bt-border)" }}>
      <input type="hidden" name="proposalId" value={proposalId} />
      <input type="hidden" name="estimateId" value={estimateId} />
      <select
        name="costCodeId"
        required
        defaultValue=""
        className="rounded border px-2 py-1 text-sm outline-none focus:border-[var(--bt-primary)]"
        style={{ borderColor: "var(--bt-border)" }}
      >
        <option value="" disabled>
          Cost code…
        </option>
        {costCodes.map((code) => (
          <option key={code.id} value={code.id}>
            {code.code} — {code.name}
          </option>
        ))}
      </select>
      <input
        name="title"
        placeholder="Line title"
        required
        className="min-w-[8rem] flex-1 rounded border px-2 py-1 text-sm outline-none focus:border-[var(--bt-primary)]"
        style={{ borderColor: "var(--bt-border)" }}
      />
      <input
        name="groupLabel"
        defaultValue={defaultGroupLabel ?? ""}
        placeholder="Group"
        className="w-36 rounded border px-2 py-1 text-sm outline-none focus:border-[var(--bt-primary)]"
        style={{ borderColor: "var(--bt-border)" }}
      />
      <input name="quantity" defaultValue="1" inputMode="decimal" title="Quantity" className="w-16 rounded border px-2 py-1 text-sm outline-none focus:border-[var(--bt-primary)]" style={{ borderColor: "var(--bt-border)" }} />
      <input name="unitCost" defaultValue="0" inputMode="decimal" title="Unit cost ($)" className="w-20 rounded border px-2 py-1 text-sm outline-none focus:border-[var(--bt-primary)]" style={{ borderColor: "var(--bt-border)" }} />
      <input name="ratePercent" defaultValue="0" inputMode="decimal" title="Rate %" className="w-16 rounded border px-2 py-1 text-sm outline-none focus:border-[var(--bt-primary)]" style={{ borderColor: "var(--bt-border)" }} />
      <button type="submit" disabled={pending} className="rounded px-3 py-1.5 text-xs font-semibold text-[var(--bt-on-primary)] disabled:opacity-50" style={{ background: "var(--bt-primary)" }}>
        {pending ? "…" : "Add line item"}
      </button>
      {state.error ? <span className="w-full text-xs text-red-600">{state.error}</span> : null}
    </form>
  );
}
