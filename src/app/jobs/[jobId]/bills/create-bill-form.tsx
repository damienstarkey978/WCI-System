"use client";

import { useActionState } from "react";

import { CostCodeLineItems, type CostCodeOption } from "@/components/financial/CostCodeLineItems";

import { createBillAction, type ActionState } from "./actions";

const INITIAL: ActionState = {};

export interface PurchaseOrderOption {
  readonly id: string;
  readonly poNumber: string;
}

export function CreateBillForm({
  jobId,
  costCodes,
  purchaseOrders,
}: {
  jobId: string;
  costCodes: readonly CostCodeOption[];
  purchaseOrders: readonly PurchaseOrderOption[];
}) {
  const [state, formAction, pending] = useActionState(createBillAction, INITIAL);

  return (
    <form action={formAction} className="rounded-lg border bg-[var(--bt-panel-bg)] p-4" style={{ borderColor: "var(--bt-border)" }}>
      <input type="hidden" name="jobId" value={jobId} />
      <h2 className="text-sm font-semibold text-[var(--bt-text)]">New bill</h2>

      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <label className="grid gap-1 text-sm">
          <span className="text-xs font-medium text-[var(--bt-muted)]">Vendor</span>
          <input
            name="vendorName"
            required
            className="rounded border px-3 py-2 text-sm outline-none focus:border-[var(--bt-primary)]"
            style={{ borderColor: "var(--bt-border)" }}
          />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="text-xs font-medium text-[var(--bt-muted)]">Bill #</span>
          <input
            name="billNumber"
            className="rounded border px-3 py-2 text-sm outline-none focus:border-[var(--bt-primary)]"
            style={{ borderColor: "var(--bt-border)" }}
          />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="text-xs font-medium text-[var(--bt-muted)]">Against PO</span>
          <select
            name="purchaseOrderId"
            defaultValue=""
            className="rounded border px-3 py-2 text-sm outline-none focus:border-[var(--bt-primary)]"
            style={{ borderColor: "var(--bt-border)" }}
          >
            <option value="">None</option>
            {purchaseOrders.map((po) => (
              <option key={po.id} value={po.id}>
                {po.poNumber}
              </option>
            ))}
          </select>
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
          className="rounded px-4 py-2 text-sm font-semibold text-[var(--bt-on-primary)] disabled:opacity-50"
          style={{ background: "var(--bt-primary)" }}
        >
          {pending ? "Creating…" : "Create bill"}
        </button>
      </div>
    </form>
  );
}
