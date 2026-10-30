"use client";

import { useActionState } from "react";

import { PermitRockstarSetupType } from "@/generated/prisma/enums";
import { formatCents } from "@/lib/money";
import type { PermitRockstarLedger } from "@/lib/permitting/service";

import { updatePermitRockstarLedgerAction, type ActionState } from "./actions";

const INITIAL: ActionState = {};

function setupLabel(value: PermitRockstarSetupType): string {
  switch (value) {
    case PermitRockstarSetupType.FLAT_FEE:
      return "Flat fee";
    case PermitRockstarSetupType.CARD_ON_FILE:
      return "Card on file";
    default:
      return value;
  }
}

export function PermitRockstarForm({
  jobId,
  ledger,
}: {
  jobId: string;
  ledger: PermitRockstarLedger;
}) {
  const [state, formAction, pending] = useActionState(updatePermitRockstarLedgerAction, INITIAL);
  const feeDefault =
    ledger.feePerInspectionCents != null ? (ledger.feePerInspectionCents / 100).toFixed(2) : "";

  return (
    <form
      action={formAction}
      className="mt-4 grid gap-2 rounded border p-3"
      style={{ borderColor: "var(--bt-border)" }}
    >
      <input type="hidden" name="jobId" value={jobId} />
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-wide text-[var(--bt-muted)]">
            Permit Rockstar
          </p>
          <p className="text-xs text-[var(--bt-muted)]">
            One ledger for this job (Duval / Jax private provider) — not per permit.
          </p>
        </div>
        {ledger.feePerInspectionCents != null ? (
          <p className="text-xs text-[var(--bt-muted)]">
            Fee/inspection: {formatCents(ledger.feePerInspectionCents)}
          </p>
        ) : null}
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <label className="flex items-center gap-2 text-xs text-[var(--bt-text)]">
          <input
            type="checkbox"
            name="privateProvider"
            value="true"
            defaultChecked={ledger.privateProvider}
            className="rounded border"
            style={{ borderColor: "var(--bt-border)" }}
          />
          Private provider
        </label>
        <label className="grid gap-0.5 text-[11px] text-[var(--bt-muted)]">
          Setup
          <select
            name="setupType"
            defaultValue={ledger.setupType ?? ""}
            className="rounded border bg-white px-2 py-1.5 text-xs text-[var(--bt-text)]"
            style={{ borderColor: "var(--bt-border)" }}
          >
            <option value="">Not set</option>
            {Object.values(PermitRockstarSetupType).map((value) => (
              <option key={value} value={value}>
                {setupLabel(value)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 text-xs text-[var(--bt-text)]">
          <input
            type="checkbox"
            name="invoiced"
            value="true"
            defaultChecked={ledger.invoiced}
            className="rounded border"
            style={{ borderColor: "var(--bt-border)" }}
          />
          Invoiced
        </label>
        <label className="flex items-center gap-2 text-xs text-[var(--bt-text)]">
          <input
            type="checkbox"
            name="paid"
            value="true"
            defaultChecked={ledger.paid}
            className="rounded border"
            style={{ borderColor: "var(--bt-border)" }}
          />
          Paid
        </label>
        <label className="grid gap-0.5 text-[11px] text-[var(--bt-muted)] sm:col-span-2">
          Fee per inspection (USD)
          <input
            name="feePerInspectionDollars"
            type="text"
            inputMode="decimal"
            defaultValue={feeDefault}
            placeholder="e.g. 75.00"
            className="rounded border bg-white px-2 py-1.5 text-xs text-[var(--bt-text)]"
            style={{ borderColor: "var(--bt-border)" }}
          />
        </label>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded px-2.5 py-1.5 text-xs font-semibold text-[var(--bt-on-primary)] disabled:opacity-50"
          style={{ background: "var(--bt-primary)" }}
        >
          {pending ? "Saving…" : "Save Rockstar ledger"}
        </button>
        {state.error ? <p className="text-xs text-red-600">{state.error}</p> : null}
        {state.ok ? <p className="text-xs text-[var(--bt-muted)]">Saved.</p> : null}
      </div>
    </form>
  );
}
