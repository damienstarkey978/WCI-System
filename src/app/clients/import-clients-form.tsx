"use client";

import { useActionState } from "react";

import { importClientsAction, type ImportClientsState } from "./actions";

const INITIAL: ImportClientsState = {};

export function ImportClientsForm() {
  const [state, formAction, pending] = useActionState(importClientsAction, INITIAL);
  const summary = state.summary;

  return (
    <form action={formAction} className="rounded-lg border bg-[var(--bt-panel-bg)] p-4" style={{ borderColor: "var(--bt-border)" }}>
      <h2 className="text-sm font-semibold text-[var(--bt-text)]">Import client contacts from CSV</h2>
      <p className="mt-1 max-w-3xl text-xs text-[var(--bt-muted)]">
        Upload Buildertrend&apos;s Client Contacts report saved as CSV (or any CSV with a <code className="font-mono">Name</code> column, and optionally{" "}
        <code className="font-mono">Email, Phone, Cell, Address, City, State, Zip, First Name, Last Name</code>). Safe to re-run: contacts already here are matched by
        email or name and only have their blank fields filled in. Nothing is emailed or invited. Rows without an email that do not match an existing contact are
        skipped (email is required to create a client).
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
            {summary.duplicateRowsMerged > 0 ? ` · ${summary.duplicateRowsMerged} duplicate row${summary.duplicateRowsMerged === 1 ? "" : "s"} merged` : ""}
            {summary.skippedNoEmail > 0 ? ` · ${summary.skippedNoEmail} skipped (no email, no match)` : ""}
          </p>
          {summary.emailsSkipped.length > 0 ? (
            <details className="mt-2 text-xs">
              <summary className="cursor-pointer font-medium text-amber-700 dark:text-amber-400">
                {summary.emailsSkipped.length} email{summary.emailsSkipped.length === 1 ? "" : "s"} not added — another client already has that address
              </summary>
              <ul className="mt-1 list-disc pl-5 text-[var(--bt-muted)]">
                {summary.emailsSkipped.map((item) => (
                  <li key={`${item.name}-${item.email}`}>
                    {item.name}: {item.email}
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
          {summary.extraEmails.length > 0 ? (
            <details className="mt-2 text-xs">
              <summary className="cursor-pointer font-medium text-amber-700 dark:text-amber-400">
                {summary.extraEmails.length} {summary.extraEmails.length === 1 ? "contact lists" : "contacts list"} more than one email — only the first was saved
              </summary>
              <ul className="mt-1 list-disc pl-5 text-[var(--bt-muted)]">
                {summary.extraEmails.map((item) => (
                  <li key={item.name}>
                    {item.name}: also {item.emails.join(", ")}
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </div>
      ) : null}
    </form>
  );
}
