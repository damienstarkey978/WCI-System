"use client";

import { useActionState } from "react";

import { CostCodeLineItems, type CostCodeOption } from "@/components/financial/CostCodeLineItems";

import { createPurchaseOrderAction, type ActionState } from "./actions";

const INITIAL: ActionState = {};

export function CreatePoForm({ jobId, costCodes }: { jobId: string; costCodes: readonly CostCodeOption[] }) {
  const [state, formAction, pending] = useActionState(createPurchaseOrderAction, INITIAL);

  return (
    <form action={formAction} className="rounded-lg border bg-[var(--bt-panel-bg)] p-4" style={{ borderColor: "var(--bt-border)" }}>
      <input type="hidden" name="jobId" value={jobId} />
      <h2 className="text-sm font-semibold text-[var(--bt-text)]">New purchase order</h2>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1 text-sm">
          <span className="text-xs font-medium text-[var(--bt-muted)]">PO #</span>
          <input
            name="poNumber"
            required
            className="rounded border px-3 py-2 text-sm outline-none focus:border-[var(--bt-primary)]"
            style={{ borderColor: "var(--bt-border)" }}
          />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="text-xs font-medium text-[var(--bt-muted)]">Vendor</span>
          <input
            name="vendorName"
            required
            className="rounded border px-3 py-2 text-sm outline-none focus:border-[var(--bt-primary)]"
            style={{ borderColor: "var(--bt-border)" }}
          />
        </label>
      </div>

      <div className="mt-3">
        <CostCodeLineItems costCodes={costCodes} />
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
          {pending ? "Creating…" : "Create purchase order"}
        </button>
      </div>
    </form>
  );
}
