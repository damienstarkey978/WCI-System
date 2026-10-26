"use client";

import { useActionState, useState } from "react";

import { CostCodeLineItems, type CostCodeOption } from "@/components/financial/CostCodeLineItems";

import { createChangeOrderAction, type ActionState } from "./actions";

const INITIAL: ActionState = {};

export function CreateChangeOrderForm({ jobId, costCodes }: { jobId: string; costCodes: readonly CostCodeOption[] }) {
  const [state, formAction, pending] = useActionState(createChangeOrderAction, INITIAL);
  const [mode, setMode] = useState<"FLAT" | "ITEMIZED">("ITEMIZED");
  const [tab, setTab] = useState<"details" | "preview">("details");

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="jobId" value={jobId} />

      <div className="flex gap-3 border-b" style={{ borderColor: "var(--bt-border)" }}>
        {(
          [
            ["details", "Details"],
            ["preview", "Client preview"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className="-mb-px border-b-2 px-1 py-2 text-sm font-medium"
            style={{
              borderColor: tab === key ? "var(--bt-primary)" : "transparent",
              color: tab === key ? "var(--bt-primary)" : "var(--bt-muted)",
            }}
          >
            {label}
          </button>
        ))}
      </div>

      <div className={tab === "details" ? "flex flex-col gap-3" : "hidden"}>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1 text-sm">
            <span className="text-xs font-medium text-[var(--bt-muted)]">Title</span>
            <input name="title" required className="rounded border px-3 py-2 text-sm outline-none focus:border-[var(--bt-primary)]" style={{ borderColor: "var(--bt-border)" }} />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="text-xs font-medium text-[var(--bt-muted)]">Approval deadline</span>
            <input type="date" name="deadline" className="rounded border px-3 py-2 text-sm" style={{ borderColor: "var(--bt-border)" }} />
          </label>
        </div>

        <label className="grid gap-1 text-sm">
          <span className="text-xs font-medium text-[var(--bt-muted)]">Pricing</span>
          <select
            name="mode"
            value={mode}
            onChange={(event) => setMode(event.target.value as "FLAT" | "ITEMIZED")}
            className="rounded border px-3 py-2 text-sm outline-none focus:border-[var(--bt-primary)]"
            style={{ borderColor: "var(--bt-border)" }}
          >
            <option value="ITEMIZED">Itemized line items</option>
            <option value="FLAT">Flat fee</option>
          </select>
        </label>

        {mode === "FLAT" ? (
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="grid gap-1 text-sm">
              <span className="text-xs font-medium text-[var(--bt-muted)]">Cost code</span>
              <select name="flatCostCodeId" required defaultValue="" className="rounded border px-3 py-2 text-sm" style={{ borderColor: "var(--bt-border)" }}>
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
              <span className="text-xs font-medium text-[var(--bt-muted)]">Builder cost</span>
              <input name="flatCost" inputMode="decimal" placeholder="0.00" className="rounded border px-3 py-2 text-sm" style={{ borderColor: "var(--bt-border)" }} />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="text-xs font-medium text-[var(--bt-muted)]">Client price</span>
              <input name="flatClientPrice" inputMode="decimal" placeholder="0.00" className="rounded border px-3 py-2 text-sm" style={{ borderColor: "var(--bt-border)" }} />
            </label>
          </div>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1 text-sm">
                <span className="text-xs font-medium text-[var(--bt-muted)]">Markup / margin</span>
                <select name="rateMode" defaultValue="MARKUP" className="rounded border px-3 py-2 text-sm" style={{ borderColor: "var(--bt-border)" }}>
                  <option value="MARKUP">Markup</option>
                  <option value="MARGIN">Margin</option>
                </select>
              </label>
              <label className="grid gap-1 text-sm">
                <span className="text-xs font-medium text-[var(--bt-muted)]">Rate %</span>
                <input name="rate" inputMode="decimal" placeholder="0" className="rounded border px-3 py-2 text-sm" style={{ borderColor: "var(--bt-border)" }} />
              </label>
            </div>
            <CostCodeLineItems costCodes={costCodes} />
          </>
        )}

        <label className="grid gap-1 text-sm">
          <span className="text-xs font-medium text-[var(--bt-muted)]">Builder notes</span>
          <textarea name="notesBuilder" rows={3} className="rounded border px-3 py-2 text-sm" style={{ borderColor: "var(--bt-border)" }} />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="text-xs font-medium text-[var(--bt-muted)]">Scope of work</span>
          <textarea name="notesClient" rows={4} className="rounded border px-3 py-2 text-sm" style={{ borderColor: "var(--bt-border)" }} />
        </label>
        <label className="flex items-center gap-2 text-sm text-[var(--bt-text)]">
          <input type="checkbox" name="invoiceOnApproval" />
          Invoice client upon approval
        </label>
      </div>

      {tab === "preview" ? (
        <div className="rounded border px-4 py-6 text-sm text-[var(--bt-muted)]" style={{ borderColor: "var(--bt-border)" }}>
          Client preview shows after the change order is saved. Clients see title, client notes, line prices, and approval controls — never builder notes.
        </div>
      ) : null}

      {state.error ? (
        <p role="alert" className="text-xs text-red-600">
          {state.error}
        </p>
      ) : null}
      {state.ok ? <p className="text-xs text-green-700">Change order created.</p> : null}

      <button type="submit" disabled={pending} className="rounded px-4 py-2 text-sm font-semibold text-[var(--bt-on-primary)] disabled:opacity-50" style={{ background: "var(--bt-primary)" }}>
        {pending ? "Creating…" : "Save"}
      </button>
    </form>
  );
}
