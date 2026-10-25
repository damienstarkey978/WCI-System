"use client";

import { useActionState } from "react";

import { importLeadsAction, type ImportLeadsState } from "./actions";

const INITIAL: ImportLeadsState = {};

export function ImportLeadsForm() {
  const [state, formAction, pending] = useActionState(importLeadsAction, INITIAL);
  const summary = state.summary;

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <p className="text-xs text-[var(--bt-muted)]">
        Upload a CSV with a header row. Recognised columns: Title, Client contact, Email, Phone, Source, Status, Project type, Street address, City, State, Zip code, Notes,
        Confidence, Est. revenue min, Est. revenue max. Safe to re-run: a lead with the same title and email is skipped, never overwritten. Nothing is emailed or sent.
      </p>
      <input name="sheet" type="file" accept=".csv,text/csv" required className="text-sm" aria-label="CSV file" />
      <div>
        <button type="submit" disabled={pending} className="rounded px-4 py-2 text-sm font-semibold text-[var(--bt-on-primary)] disabled:opacity-50" style={{ background: "var(--bt-primary)" }}>
          {pending ? "Importing…" : "Import"}
        </button>
      </div>
      {state.error ? (
        <p role="alert" className="text-sm text-red-600">
          {state.error}
        </p>
      ) : null}
      {summary ? (
        <div role="status" className="rounded border p-3 text-sm text-[var(--bt-text)]" style={{ borderColor: "var(--bt-border)" }}>
          <p className="font-semibold">
            Imported {summary.created} new, skipped {summary.skippedExisting} already here.
          </p>
          <p className="mt-1 text-xs text-[var(--bt-muted)]">
            {summary.rowsRead} rows read
            {summary.statusUnrecognized > 0 ? `, ${summary.statusUnrecognized} with a status that did not match a stage (imported as New)` : ""}
          </p>
        </div>
      ) : null}
    </form>
  );
}
