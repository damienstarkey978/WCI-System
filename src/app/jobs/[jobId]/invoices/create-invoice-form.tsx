"use client";

import { useActionState, useState } from "react";

import { createInvoiceAction, type ActionState } from "./actions";

const INITIAL: ActionState = {};

interface LineItemRow {
  readonly key: number;
}

export function CreateInvoiceForm({ jobId }: { jobId: string }) {
  const [state, formAction, pending] = useActionState(createInvoiceAction, INITIAL);
  const [type, setType] = useState<"FLAT" | "LINE_ITEM">("FLAT");
  const [rows, setRows] = useState<LineItemRow[]>([{ key: 0 }]);
  const [nextKey, setNextKey] = useState(1);

  return (
    <form action={formAction} className="rounded-lg border bg-white p-4" style={{ borderColor: "var(--bt-border)" }}>
      <input type="hidden" name="jobId" value={jobId} />
      <h2 className="text-sm font-semibold text-[var(--bt-text)]">New invoice</h2>

      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <label className="grid gap-1 text-sm">
          <span className="text-xs font-medium text-[var(--bt-muted)]">Invoice #</span>
          <input
            name="invoiceNumber"
            required
            className="rounded border px-3 py-2 text-sm outline-none focus:border-[var(--bt-primary)]"
            style={{ borderColor: "var(--bt-border)" }}
          />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="text-xs font-medium text-[var(--bt-muted)]">Type</span>
          <select
            name="type"
            value={type}
            onChange={(event) => setType(event.target.value as "FLAT" | "LINE_ITEM")}
            className="rounded border px-3 py-2 text-sm outline-none focus:border-[var(--bt-primary)]"
            style={{ borderColor: "var(--bt-border)" }}
          >
            <option value="FLAT">Flat amount</option>
            <option value="LINE_ITEM">Line items</option>
          </select>
        </label>
        <label className="grid gap-1 text-sm">
          <span className="text-xs font-medium text-[var(--bt-muted)]">Due date</span>
          <input
            type="date"
            name="dueOn"
            className="rounded border px-3 py-2 text-sm outline-none focus:border-[var(--bt-primary)]"
            style={{ borderColor: "var(--bt-border)" }}
          />
        </label>
      </div>

      {type === "FLAT" ? (
        <label className="mt-3 grid max-w-xs gap-1 text-sm">
          <span className="text-xs font-medium text-[var(--bt-muted)]">Amount</span>
          <input
            name="amount"
            inputMode="decimal"
            placeholder="0.00"
            className="rounded border px-3 py-2 text-sm outline-none focus:border-[var(--bt-primary)]"
            style={{ borderColor: "var(--bt-border)" }}
          />
        </label>
      ) : (
        <div className="mt-3 flex flex-col gap-2">
          <span className="text-xs font-medium text-[var(--bt-muted)]">Line items</span>
          {rows.map((row) => (
            <div key={row.key} className="flex gap-2">
              <input
                name="lineItemTitle"
                placeholder="Description"
                className="flex-1 rounded border px-3 py-2 text-sm outline-none focus:border-[var(--bt-primary)]"
                style={{ borderColor: "var(--bt-border)" }}
              />
              <input
                name="lineItemAmount"
                inputMode="decimal"
                placeholder="0.00"
                className="w-32 rounded border px-3 py-2 text-sm outline-none focus:border-[var(--bt-primary)]"
                style={{ borderColor: "var(--bt-border)" }}
              />
              {rows.length > 1 ? (
                <button
                  type="button"
                  onClick={() => setRows((current) => current.filter((r) => r.key !== row.key))}
                  className="px-2 text-xs text-[var(--bt-muted)] hover:text-red-600"
                  aria-label="Remove line item"
                >
                  ✕
                </button>
              ) : null}
            </div>
          ))}
          <button
            type="button"
            onClick={() => {
              setRows((current) => [...current, { key: nextKey }]);
              setNextKey((k) => k + 1);
            }}
            className="self-start text-xs font-medium text-[var(--bt-primary)] hover:underline"
          >
            + Add line item
          </button>
        </div>
      )}

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
          {pending ? "Creating…" : "Create invoice"}
        </button>
      </div>
    </form>
  );
}
