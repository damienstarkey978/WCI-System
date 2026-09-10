"use client";

import { useState } from "react";

export interface PreviewLine {
  readonly id: string;
  readonly title: string;
  readonly description: string | null;
  readonly amount: string;
}

export interface PreviewData {
  readonly organizationName: string;
  readonly clientName: string | null;
  readonly jobName: string;
  readonly jobAddress: string | null;
  readonly invoiceNumber: string;
  readonly issuedOn: string;
  readonly dueOn: string;
  readonly terms: string;
  readonly lines: readonly PreviewLine[];
  readonly subtotal: string;
  readonly taxLabel: string | null;
  readonly tax: string;
  readonly total: string;
  readonly paid: string;
  readonly balance: string;
  readonly message: string | null;
}

/**
 * What the client sees, shown to the office before it goes out.
 *
 * Deliberately a preview of the *client* document, not the internal one: no cost
 * codes, no markup, no unit costs, no internal notes. If a number here surprises the
 * person sending it, the time to find that out is now rather than after the client
 * has read it.
 */
export function ClientPreview({ data }: { data: PreviewData }) {
  const [open, setOpen] = useState(false);

  return (
    <section className="rounded-lg border bg-[var(--bt-panel-bg)] p-4" style={{ borderColor: "var(--bt-border)" }}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-[var(--bt-text)]">Client preview</h2>
        <button
          type="button"
          onClick={() => setOpen((current) => !current)}
          aria-expanded={open}
          className="text-xs font-medium hover:underline"
          style={{ color: "var(--bt-primary)" }}
        >
          {open ? "Hide" : "Show what the client sees"}
        </button>
      </div>

      {!open ? null : (
        <div
          className="mt-3 rounded border p-5"
          style={{ borderColor: "var(--bt-border)", background: "var(--bt-canvas, #ffffff)", color: "#111827" }}
        >
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="text-base font-semibold">{data.organizationName}</div>
              <div className="mt-1 text-xs text-gray-600">{data.jobName}</div>
              {data.jobAddress ? <div className="text-xs text-gray-600">{data.jobAddress}</div> : null}
            </div>
            <div className="text-right text-xs text-gray-600">
              <div className="text-base font-semibold text-gray-900">Invoice {data.invoiceNumber}</div>
              <div className="mt-1">Issued {data.issuedOn}</div>
              <div>
                Due {data.dueOn} · {data.terms}
              </div>
            </div>
          </div>

          {data.clientName ? <div className="mt-4 text-sm">Billed to {data.clientName}</div> : null}

          <table className="mt-4 w-full text-left text-sm">
            <thead>
              <tr className="border-b border-gray-300 text-xs uppercase tracking-wide text-gray-500">
                <th className="py-2">Description</th>
                <th className="py-2 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {data.lines.map((line) => (
                <tr key={line.id} className="border-b border-gray-200">
                  <td className="py-2">
                    <div>{line.title}</div>
                    {line.description ? <div className="text-xs text-gray-600">{line.description}</div> : null}
                  </td>
                  <td className="py-2 text-right">{line.amount}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="mt-3 flex flex-col items-end gap-1 text-sm">
            <div className="flex w-56 justify-between">
              <span className="text-gray-600">Subtotal</span>
              <span>{data.subtotal}</span>
            </div>
            {data.taxLabel ? (
              <div className="flex w-56 justify-between">
                <span className="text-gray-600">{data.taxLabel}</span>
                <span>{data.tax}</span>
              </div>
            ) : null}
            <div className="flex w-56 justify-between font-semibold">
              <span>Total</span>
              <span>{data.total}</span>
            </div>
            <div className="flex w-56 justify-between">
              <span className="text-gray-600">Paid to date</span>
              <span>{data.paid}</span>
            </div>
            <div className="flex w-56 justify-between border-t border-gray-300 pt-1 font-semibold">
              <span>Amount due</span>
              <span>{data.balance}</span>
            </div>
          </div>

          {data.message ? <p className="mt-4 whitespace-pre-wrap text-sm text-gray-700">{data.message}</p> : null}
        </div>
      )}
    </section>
  );
}
