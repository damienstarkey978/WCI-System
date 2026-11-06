"use client";

import { useState } from "react";

import { OutboundBrandMark } from "@/components/branding/OutboundBrandMark";

export interface PreviewLine {
  readonly id: string;
  readonly title: string;
  readonly description: string | null;
  readonly amount: string;
}

export interface PreviewData {
  readonly organizationName: string;
  readonly organizationLogoPath?: string | null;
  readonly companyAddress: string | null;
  readonly companyPhone: string;
  readonly companySlogan: string;
  readonly clientName: string | null;
  readonly clientAddress: string | null;
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
 * Buildertrend Client preview tab: display settings + letterhead document preview.
 * Deliberately client-facing — no cost codes, markup, or internal notes.
 */
export function InvoiceClientPreviewPane({ data }: { data: PreviewData }) {
  const [hideLineItems, setHideLineItems] = useState(false);
  const [combineByCostCode, setCombineByCostCode] = useState(false);
  const [showItems, setShowItems] = useState(true);
  const [showDescription, setShowDescription] = useState(true);
  const [showPrice, setShowPrice] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(true);

  return (
    <div className="flex flex-col gap-4 px-4 py-4 sm:px-6 sm:py-5">
      <section className="rounded border p-4" style={{ borderColor: "var(--bt-border)" }}>
        <div className="flex items-start justify-between gap-2">
          <h2 className="inline-flex items-center gap-1 text-sm font-semibold text-[var(--bt-text)]">
            Client display settings
            <span className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-full bg-sky-100 text-[9px] font-bold text-sky-600">
              i
            </span>
          </h2>
          <button
            type="button"
            className="text-xs font-medium text-[var(--bt-muted)] hover:underline"
            onClick={() => setSettingsOpen((open) => !open)}
          >
            {settingsOpen ? "Collapse" : "Expand"}
          </button>
        </div>

        {settingsOpen ? (
          <div className="mt-3 grid gap-4 lg:grid-cols-[1fr_auto]">
            <div className="space-y-3 text-sm text-[var(--bt-text)]">
              <div>
                <div className="text-xs font-semibold text-[var(--bt-muted)]">Line items</div>
                <label className="mt-1 flex items-center gap-2">
                  <input type="checkbox" checked={hideLineItems} onChange={(e) => setHideLineItems(e.target.checked)} />
                  Hide line items
                </label>
                <label className="mt-1 flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={combineByCostCode}
                    onChange={(e) => setCombineByCostCode(e.target.checked)}
                  />
                  Combine line items by cost code
                </label>
              </div>
              <div>
                <div className="text-xs font-semibold text-[var(--bt-muted)]">Columns</div>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {(
                    [
                      ["Items", showItems, setShowItems],
                      ["Description", showDescription, setShowDescription],
                      ["Client price", showPrice, setShowPrice],
                    ] as const
                  ).map(([label, on, setOn]) =>
                    on ? (
                      <button
                        key={label}
                        type="button"
                        onClick={() => setOn(false)}
                        className="inline-flex items-center gap-1 rounded border px-2 py-0.5 text-xs"
                        style={{ borderColor: "var(--bt-border)", background: "var(--bt-panel-bg-muted)" }}
                      >
                        {label}
                        <span aria-hidden>×</span>
                      </button>
                    ) : (
                      <button
                        key={label}
                        type="button"
                        onClick={() => setOn(true)}
                        className="rounded border border-dashed px-2 py-0.5 text-xs text-[var(--bt-muted)]"
                        style={{ borderColor: "var(--bt-border)" }}
                      >
                        + {label}
                      </button>
                    ),
                  )}
                </div>
                <button
                  type="button"
                  className="mt-2 rounded border px-2.5 py-1 text-xs font-semibold text-[var(--bt-text)] hover:bg-black/5"
                  style={{ borderColor: "var(--bt-border)" }}
                >
                  Set as default
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </section>

      <article
        className="rounded border bg-white p-5 text-[#111827] shadow-sm sm:p-8"
        style={{ borderColor: "var(--bt-border)" }}
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <OutboundBrandMark
              organizationLogoPath={data.organizationLogoPath}
              className="mb-2 h-12 w-auto max-w-[12rem] object-contain"
            />
            <div className="text-sm font-semibold uppercase tracking-wide text-[#0f4c81]">{data.organizationName}</div>
            {data.companyAddress ? <div className="mt-1 text-xs text-gray-600">{data.companyAddress}</div> : null}
            <div className="text-xs text-gray-600">{data.companyPhone}</div>
            <div className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-gray-500">{data.companySlogan}</div>
          </div>
          <div className="min-w-[12rem] text-right text-xs text-gray-600">
            <div>Invoice date: {data.issuedOn}</div>
            <div>Invoice ID: {data.invoiceNumber}</div>
            <div
              className="mt-2 rounded px-3 py-2 text-left text-sm font-semibold text-white"
              style={{ background: "#4b5563" }}
            >
              Amount due:
              <div className="text-base">{data.balance}</div>
            </div>
          </div>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">Bill to:</div>
            <div className="mt-1 text-sm font-medium">{data.clientName ?? "—"}</div>
            {data.clientAddress ? <div className="text-xs text-gray-600">{data.clientAddress}</div> : null}
          </div>
        </div>

        <div className="mt-5 border-t border-gray-200 pt-3 text-sm font-semibold">
          {data.jobName}
          {data.jobAddress ? ` · ${data.jobAddress}` : ""}
        </div>

        {!hideLineItems ? (
          <table className="mt-4 w-full text-left text-sm">
            <thead>
              <tr className="border-b border-gray-300 bg-gray-50 text-[10px] font-semibold uppercase tracking-wide text-gray-500">
                {showItems ? <th className="px-2 py-2">Items</th> : null}
                {showDescription ? <th className="px-2 py-2">Description</th> : null}
                {showPrice ? <th className="px-2 py-2 text-right">Price</th> : null}
              </tr>
            </thead>
            <tbody>
              {(combineByCostCode ? data.lines : data.lines).map((line) => (
                <tr key={line.id} className="border-b border-gray-200">
                  {showItems ? <td className="px-2 py-2 align-top">{line.title}</td> : null}
                  {showDescription ? (
                    <td className="px-2 py-2 align-top text-xs text-gray-600">{line.description ?? ""}</td>
                  ) : null}
                  {showPrice ? <td className="px-2 py-2 text-right align-top">{line.amount}</td> : null}
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="mt-4 text-sm italic text-gray-500">Line items hidden for the client.</p>
        )}

        <div className="mt-4 flex flex-col items-end gap-1 text-sm">
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
        {data.terms ? <p className="mt-2 text-xs text-gray-500">Payment terms: {data.terms}</p> : null}
      </article>
    </div>
  );
}

/** @deprecated Prefer InvoiceClientPreviewPane inside the BT detail shell. */
export function ClientPreview({ data }: { data: PreviewData }) {
  return <InvoiceClientPreviewPane data={data} />;
}
