"use client";

import { useActionState, useRef } from "react";

import { createEstimateFromCsvAction, type ActionState } from "./actions";

const INITIAL: ActionState = {};

export function CsvImportForm({ jobId }: { jobId: string }) {
  const [state, formAction, pending] = useActionState(createEstimateFromCsvAction, INITIAL);
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form
      ref={formRef}
      action={async (formData) => {
        await formAction(formData);
        formRef.current?.reset();
      }}
      className="rounded-lg border bg-white p-4"
      style={{ borderColor: "var(--bt-border)" }}
    >
      <input type="hidden" name="jobId" value={jobId} />
      <h2 className="text-sm font-semibold text-[var(--bt-text)]">Import estimate from CSV</h2>
      <p className="mt-1 text-xs text-[var(--bt-muted)]">
        Header row with columns: <code className="font-mono">Cost Code, Title, Quantity, Unit Cost</code> (Quantity optional, defaults to 1). Cost Code must
        match an existing cost code&apos;s code exactly.
      </p>
      <div className="mt-3 grid gap-3 sm:grid-cols-4">
        <label className="grid gap-1 text-sm">
          <span className="text-xs font-medium text-[var(--bt-muted)]">Title</span>
          <input name="title" required className="rounded border px-3 py-2 text-sm outline-none focus:border-[var(--bt-primary)]" style={{ borderColor: "var(--bt-border)" }} />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="text-xs font-medium text-[var(--bt-muted)]">Rate mode</span>
          <select name="rateMode" defaultValue="MARKUP" className="rounded border px-3 py-2 text-sm outline-none focus:border-[var(--bt-primary)]" style={{ borderColor: "var(--bt-border)" }}>
            <option value="MARKUP">Markup</option>
            <option value="MARGIN">Margin</option>
          </select>
        </label>
        <label className="grid gap-1 text-sm">
          <span className="text-xs font-medium text-[var(--bt-muted)]">Default rate %</span>
          <input name="defaultRate" inputMode="decimal" placeholder="0" className="rounded border px-3 py-2 text-sm outline-none focus:border-[var(--bt-primary)]" style={{ borderColor: "var(--bt-border)" }} />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="text-xs font-medium text-[var(--bt-muted)]">CSV file</span>
          <input name="csvFile" type="file" accept=".csv,text/csv" required className="text-sm" />
        </label>
      </div>
      {state.error ? (
        <p role="alert" className="mt-2 text-xs text-red-600">
          {state.error}
        </p>
      ) : null}
      <div className="mt-3">
        <button type="submit" disabled={pending} className="rounded px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" style={{ background: "var(--bt-primary)" }}>
          {pending ? "Importing…" : "Import CSV"}
        </button>
      </div>
    </form>
  );
}
