"use client";

import { useActionState } from "react";

import { importVendorsAction, type ImportVendorsState } from "./actions";

const INITIAL: ImportVendorsState = {};

export function ImportVendorsForm() {
  const [state, formAction, pending] = useActionState(importVendorsAction, INITIAL);
  const summary = state.summary;

  return (
    <form action={formAction} className="rounded-lg border bg-[var(--bt-panel-bg)] p-4" style={{ borderColor: "var(--bt-border)" }}>
      <h2 className="text-sm font-semibold text-[var(--bt-text)]">Import subs/vendors from CSV</h2>
      <p className="mt-1 max-w-3xl text-xs text-[var(--bt-muted)]">
        Upload Buildertrend&apos;s Subs report saved as CSV (or any CSV with a <code className="font-mono">Company</code> column, and optionally{" "}
        <code className="font-mono">Division, Primary contact, Email, Phone, Cell</code>). Safe to re-run: companies already here are matched by name and only
        have their blank fields filled in — nothing you&apos;ve entered is overwritten. Buildertrend&apos;s own Activation column is ignored, since it describes
        their Buildertrend login, not this system&apos;s.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <input name="sheet" type="file" accept=".csv,text/csv" required className="text-sm" aria-label="CSV file" />
        <button type="submit" disabled={pending} className="rounded px-4 py-2 text-sm font-semibold text-[var(--bt-on-primary)] disabled:opacity-50" style={{ background: "var(--bt-primary)" }}>
          {pending ? "Importing…" : "Import"}
        </button>
      </div>
      {state.error ? (
        <p role="alert" className="mt-3 text-sm text-red-600">
          {state.error}
        </p>
      ) : null}
      {summary ? (
        <div role="status" className="mt-3 rounded border p-3 text-sm text-[var(--bt-text)]" style={{ borderColor: "var(--bt-border)" }}>
          <p className="font-semibold">
            Imported {summary.created} new, updated {summary.updated}, {summary.unchanged} already up to date.
          </p>
          <p className="mt-1 text-xs text-[var(--bt-muted)]">
            {summary.rowsRead} rows read
            {summary.duplicateRowsMerged > 0 ? ` · ${summary.duplicateRowsMerged} duplicate row${summary.duplicateRowsMerged === 1 ? "" : "s"} for the same company merged` : ""}
            {summary.emailsSkipped.length > 0 ? ` · ${summary.emailsSkipped.length} email${summary.emailsSkipped.length === 1 ? "" : "s"} skipped because another vendor already has it (${summary.emailsSkipped.join(", ")})` : ""}
          </p>
        </div>
      ) : null}
    </form>
  );
}
