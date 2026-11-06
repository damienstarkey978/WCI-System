"use client";

import Link from "next/link";
import { useActionState, useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";

import { OutboundBrandMark } from "@/components/branding/OutboundBrandMark";
import { CloseIcon, HelpIcon, MaximizeIcon, ShareIcon } from "@/components/shell/icons";
import { formatCompanyAddress, resolveCompanySlogan, WCI_COMPANY_DEFAULTS } from "@/lib/organization/company-defaults";
import { PAYMENT_TERMS_LABELS } from "@/lib/invoicing/terms";

import { createInvoiceAction, type ActionState } from "./actions";
import { InvoiceClientPreviewPane } from "./[invoiceId]/client-preview";

const INITIAL: ActionState = {};

interface LineItemRow {
  readonly key: number;
}

export type CreateInvoiceModalProps = {
  readonly jobId: string;
  readonly jobName: string;
  readonly organizationName: string;
  readonly organizationLogoPath?: string | null;
  readonly orgAddressLine1?: string | null;
  readonly orgCity?: string | null;
  readonly orgState?: string | null;
  readonly orgPostalCode?: string | null;
  readonly orgPhone?: string | null;
  readonly orgSlogan?: string | null;
  readonly clientName?: string | null;
  readonly clientAddress?: string | null;
  readonly jobAddress?: string | null;
  /** False while `QBO_INVOICE_PUSH_ENABLED` is unset — checkbox stays, live push refuses. */
  readonly qboInvoicePushEnabled?: boolean;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
};

function InfoDot({ title }: { title: string }) {
  return (
    <span
      className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-full bg-sky-100 text-[9px] font-bold text-sky-600"
      title={title}
    >
      i
    </span>
  );
}

function Label({ children, info }: { children: ReactNode; info?: string }) {
  return (
    <div className="inline-flex items-center gap-1 text-xs font-medium text-[var(--bt-muted)]">
      {children}
      {info ? <InfoDot title={info} /> : null}
    </div>
  );
}

function Segmented({
  value,
  options,
  onChange,
}: {
  value: string;
  options: readonly { value: string; label: string; info?: boolean }[];
  onChange: (value: string) => void;
}) {
  return (
    <div className="inline-flex overflow-hidden rounded border" style={{ borderColor: "var(--bt-border)" }}>
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium"
            style={
              active
                ? { background: "var(--bt-primary)", color: "var(--bt-on-primary)" }
                : { background: "var(--bt-panel-bg)", color: "var(--bt-muted)" }
            }
          >
            {option.label}
            {option.info ? <InfoDot title={option.label} /> : null}
          </button>
        );
      })}
    </div>
  );
}

function SendIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden>
      <path d="M3.1 2.3a1 1 0 0 1 1.08-.12l13 6.5a1 1 0 0 1 0 1.84l-13 6.5A1 1 0 0 1 2 16.5v-4.3a1 1 0 0 1 .7-.95l6.55-2.05a.25.25 0 0 0 0-.48L2.7 6.67A1 1 0 0 1 2 5.72V3.1a1 1 0 0 1 1.1-.8Z" />
    </svg>
  );
}

function formatPreviewMoney(raw: string): string {
  const cleaned = raw.replace(/[^0-9.]/g, "");
  if (!cleaned) return "$0.00";
  const value = Number.parseFloat(cleaned);
  if (!Number.isFinite(value)) return "$0.00";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
}

/**
 * Buildertrend Create Invoice modal — full Details / Client preview chrome from + Invoice.
 * Replaces the stub CreateModal (Invoice # / Type / Amount / Create invoice).
 */
export function CreateInvoiceForm(props: CreateInvoiceModalProps) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(createInvoiceAction, INITIAL);
  const [tab, setTab] = useState<"details" | "preview">("details");
  const [type, setType] = useState<"FLAT" | "LINE_ITEM">("FLAT");
  const [dueMode, setDueMode] = useState<"invoice" | "schedule">("invoice");
  const [rows, setRows] = useState<LineItemRow[]>([{ key: 0 }]);
  const [nextKey, setNextKey] = useState(1);
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("0.00");
  const [issuedOn, setIssuedOn] = useState(() => new Date().toISOString().slice(0, 10));
  const [dueOn, setDueOn] = useState("");
  const [paymentTerms, setPaymentTerms] = useState("CUSTOM");
  const [clientMessage, setClientMessage] = useState("");
  const [description, setDescription] = useState("");
  const [internalNotes, setInternalNotes] = useState("");
  // BT still owns QuickBooks — OS pushes duplicate invoices. Default OFF; never auto-push.
  const [invoiceToQbo, setInvoiceToQbo] = useState(false);
  const qboInvoicePushEnabled = props.qboInvoicePushEnabled === true;
  const [paymentHistoryOpen, setPaymentHistoryOpen] = useState(true);
  const [helpOpen, setHelpOpen] = useState(false);
  const [shareNote, setShareNote] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [taxHint, setTaxHint] = useState(false);

  const filesHref = `/jobs/${props.jobId}/files`;
  const scheduleHref = `/jobs/${props.jobId}/schedule`;

  const companyAddress = useMemo(
    () =>
      formatCompanyAddress({
        addressLine1: props.orgAddressLine1 ?? WCI_COMPANY_DEFAULTS.addressLine1,
        city: props.orgCity ?? WCI_COMPANY_DEFAULTS.city,
        state: props.orgState ?? WCI_COMPANY_DEFAULTS.state,
        postalCode: props.orgPostalCode ?? WCI_COMPANY_DEFAULTS.postalCode,
      }),
    [props.orgAddressLine1, props.orgCity, props.orgState, props.orgPostalCode],
  );
  const companyPhone = props.orgPhone?.trim() || WCI_COMPANY_DEFAULTS.contactPhone;
  const companySlogan = resolveCompanySlogan(props.orgSlogan);

  const totalLabel = formatPreviewMoney(amount);
  const termsLabel =
    paymentTerms === "CUSTOM" ? "" : (PAYMENT_TERMS_LABELS[paymentTerms as keyof typeof PAYMENT_TERMS_LABELS] ?? "");

  useEffect(() => {
    if (!state.ok || !state.invoiceId) return;
    props.onOpenChange(false);
    router.push(`/jobs/${props.jobId}/invoices/${state.invoiceId}`);
    router.refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- navigate once per successful create
  }, [state.ok, state.invoiceId, props.jobId, props.onOpenChange, router]);

  useEffect(() => {
    if (!shareNote) return;
    const timer = window.setTimeout(() => setShareNote(null), 2200);
    return () => window.clearTimeout(timer);
  }, [shareNote]);

  async function shareInvoiceDraft() {
    const url = `${window.location.origin}/jobs/${props.jobId}/invoices`;
    try {
      if (navigator.share) {
        await navigator.share({ title: `${props.jobName} — Invoice`, url });
        setShareNote("Shared");
        return;
      }
    } catch {
      /* clipboard fallback */
    }
    try {
      await navigator.clipboard.writeText(url);
      setShareNote("Link copied");
    } catch {
      setShareNote("Copy failed");
    }
  }

  if (!props.open) return null;

  const fieldClass =
    "w-full rounded border bg-white px-3 py-2 text-sm outline-none focus:border-[var(--bt-primary)]";
  const fieldStyle = { borderColor: "var(--bt-border)" } as const;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-3">
      <button
        type="button"
        className="absolute inset-0 bg-black/40"
        aria-label="Close create invoice"
        onClick={() => props.onOpenChange(false)}
      />
      <div
        className={`relative flex max-h-[96vh] w-full flex-col overflow-hidden rounded-t-lg bg-[var(--bt-panel-bg)] shadow-xl sm:max-h-[92vh] sm:rounded-lg ${expanded ? "max-w-[min(100vw-1rem,80rem)]" : "max-w-5xl"}`}
        role="dialog"
        aria-modal="true"
        aria-label="Invoice"
      >
        <form action={formAction} className="flex min-h-0 flex-1 flex-col">
          <input type="hidden" name="jobId" value={props.jobId} />
          <input type="hidden" name="type" value={type} />
          <input type="hidden" name="paymentTerms" value={paymentTerms} />
          <input type="hidden" name="invoiceToQbo" value={invoiceToQbo ? "1" : "0"} />
          <input type="hidden" name="description" value={description} />
          <input type="hidden" name="internalNotes" value={internalNotes} />

          <header
            className="flex shrink-0 items-start justify-between gap-3 border-b px-4 py-3 sm:px-5"
            style={{ borderColor: "var(--bt-border)" }}
          >
            <div className="min-w-0">
              <div className="truncate text-xs text-[var(--bt-muted)]">{props.jobName}</div>
              <h1 className="text-lg font-semibold text-[var(--bt-text)]">Invoice</h1>
            </div>
            <div className="relative flex shrink-0 items-center gap-0.5">
              <button
                type="button"
                onClick={() => void shareInvoiceDraft()}
                aria-label="Share"
                title="Share"
                className="rounded p-1.5 text-[#16a34a] hover:bg-black/5"
              >
                <ShareIcon className="h-4 w-4" />
              </button>
              {shareNote ? (
                <span className="absolute right-24 top-full z-10 mt-1 whitespace-nowrap rounded bg-[#111827] px-2 py-1 text-[11px] text-white" role="status">
                  {shareNote}
                </span>
              ) : null}
              <button
                type="button"
                onClick={() => setHelpOpen((open) => !open)}
                aria-expanded={helpOpen}
                aria-label="Help"
                title="Help"
                className="rounded p-1.5 text-[#3b82f6] hover:bg-black/5"
              >
                <HelpIcon className="h-4 w-4" />
              </button>
              {helpOpen ? (
                <div
                  className="absolute right-0 top-full z-20 mt-1 w-[min(18rem,calc(100vw-2rem))] rounded-md border bg-white p-3 text-sm shadow-lg"
                  style={{ borderColor: "var(--bt-border)" }}
                  role="dialog"
                  aria-label="Create invoice help"
                >
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-sm font-semibold text-[var(--bt-text)]">Create invoice</h3>
                    <button type="button" aria-label="Close help" className="rounded p-0.5 text-[var(--bt-muted)] hover:bg-black/5" onClick={() => setHelpOpen(false)}>
                      <CloseIcon className="h-4 w-4" />
                    </button>
                  </div>
                  <p className="mt-2 text-xs leading-relaxed text-[var(--bt-muted)]">
                    Fill Details, check Client preview, then Save (draft) or Send. ID # auto-assigns when blank. Attachments open this job&apos;s Files.
                  </p>
                </div>
              ) : null}
              <button
                type="button"
                onClick={() => setExpanded((value) => !value)}
                aria-pressed={expanded}
                aria-label={expanded ? "Exit full width" : "Expand"}
                title={expanded ? "Exit full width" : "Expand"}
                className="rounded p-1.5 text-[#0ea5e9] hover:bg-black/5"
              >
                <MaximizeIcon className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => props.onOpenChange(false)}
                aria-label="Close"
                className="rounded p-1.5 text-[var(--bt-muted)] hover:bg-black/5"
              >
                <CloseIcon className="h-4 w-4" />
              </button>
            </div>
          </header>

          <nav className="flex shrink-0 gap-1 border-b px-4 sm:px-5" style={{ borderColor: "var(--bt-border)" }}>
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
                className="-mb-px border-b-2 px-3 py-2.5 text-sm font-medium"
                style={{
                  borderColor: tab === key ? "var(--bt-primary)" : "transparent",
                  color: tab === key ? "var(--bt-primary)" : "var(--bt-muted)",
                }}
              >
                {label}
              </button>
            ))}
          </nav>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {tab === "details" ? (
              <div className="flex flex-col gap-0 px-4 py-4 sm:px-6 sm:py-5">
                <section className="border-b pb-5" style={{ borderColor: "var(--bt-border)" }}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2 className="text-sm font-semibold text-[var(--bt-text)]">Invoice information</h2>
                    <span
                      className="rounded px-2 py-0.5 text-[11px] font-semibold"
                      style={{ background: "#e5e7eb", color: "#374151" }}
                    >
                      Draft
                    </span>
                  </div>

                  <div className="mt-4 grid gap-x-6 gap-y-4 sm:grid-cols-[1fr_10rem]">
                    <label className="grid gap-1">
                      <Label>Title</Label>
                      <input
                        name="title"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        className={fieldClass}
                        style={fieldStyle}
                      />
                    </label>
                    <label className="grid gap-1">
                      <Label info="Assigned when you save if left blank">ID #</Label>
                      <input
                        name="invoiceNumber"
                        placeholder="(Auto assign)"
                        className={fieldClass}
                        style={fieldStyle}
                      />
                    </label>
                  </div>

                  <div className="mt-4 flex flex-wrap items-center gap-3">
                    <span className="text-xs font-medium text-[var(--bt-muted)]">Due date</span>
                    <Segmented
                      value={dueMode}
                      onChange={(value) => setDueMode(value as "invoice" | "schedule")}
                      options={[
                        { value: "invoice", label: "Invoice date" },
                        { value: "schedule", label: "Link to Schedule" },
                      ]}
                    />
                  </div>
                  {dueMode === "schedule" ? (
                    <p className="mt-2 text-xs text-[var(--bt-muted)]">
                      Due dates still save on this invoice. Open the schedule to pick milestone dates:{" "}
                      <Link href={scheduleHref} className="font-medium text-[var(--bt-primary)] hover:underline" onClick={() => props.onOpenChange(false)}>
                        Open Schedule
                      </Link>
                      .
                    </p>
                  ) : null}

                  <div className="mt-4 grid gap-x-6 gap-y-4 sm:grid-cols-3">
                    <label className="grid gap-1">
                      <Label>Invoice date</Label>
                      <input
                        type="date"
                        name="issuedOn"
                        value={issuedOn}
                        onChange={(e) => setIssuedOn(e.target.value)}
                        className={fieldClass}
                        style={fieldStyle}
                      />
                    </label>
                    <label className="grid gap-1">
                      <Label info="WCI does not use Net 30 by default">Payment terms</Label>
                      <select
                        value={paymentTerms}
                        onChange={(e) => setPaymentTerms(e.target.value)}
                        className={fieldClass}
                        style={fieldStyle}
                      >
                        <option value="CUSTOM">None</option>
                        <option value="DUE_ON_RECEIPT">Due on receipt</option>
                        <option value="NET_15">Net 15</option>
                        <option value="NET_45">Net 45</option>
                        <option value="NET_60">Net 60</option>
                      </select>
                    </label>
                    <label className="grid gap-1">
                      <Label>Due date</Label>
                      <input
                        type="date"
                        name="dueOn"
                        value={dueOn}
                        onChange={(e) => setDueOn(e.target.value)}
                        className={fieldClass}
                        style={fieldStyle}
                      />
                    </label>
                  </div>
                </section>

                <section className="border-b py-5" style={{ borderColor: "var(--bt-border)" }}>
                  <h2 className="text-sm font-semibold text-[var(--bt-text)]">Client price</h2>

                  <div className="mt-4 flex flex-wrap items-end gap-4">
                    <label className="grid min-w-[12rem] gap-1">
                      <Label>Taxes</Label>
                      <div className="flex items-center gap-2">
                        {type === "LINE_ITEM" ? (
                          <input
                            name="taxRate"
                            defaultValue="0"
                            inputMode="decimal"
                            placeholder="0"
                            className={`${fieldClass} max-w-[8rem]`}
                            style={fieldStyle}
                            aria-label="Sales tax rate %"
                          />
                        ) : (
                          <select className={fieldClass} style={fieldStyle} disabled value="none">
                            <option value="none">No Tax</option>
                          </select>
                        )}
                        <button
                          type="button"
                          className="text-sm font-medium text-[var(--bt-primary)] hover:underline"
                          onClick={() => {
                            setType("LINE_ITEM");
                            setTaxHint(true);
                          }}
                        >
                          Manage
                        </button>
                      </div>
                      {taxHint ? (
                        <p className="mt-1 text-xs text-[var(--bt-muted)]">
                          Tax is set per invoice via Line items + tax rate % (and Tax on each line). Company tax presets are not configured yet.
                        </p>
                      ) : null}
                    </label>

                    <Segmented
                      value={type}
                      onChange={(value) => setType(value as "FLAT" | "LINE_ITEM")}
                      options={[
                        { value: "FLAT", label: "Flat fee" },
                        { value: "LINE_ITEM", label: "Line items", info: true },
                      ]}
                    />
                  </div>

                  {type === "FLAT" ? (
                    <label className="mt-4 grid max-w-xs gap-1">
                      <Label>Client price</Label>
                      <div className="relative">
                        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-[var(--bt-muted)]">
                          $
                        </span>
                        <input
                          name="amount"
                          inputMode="decimal"
                          value={amount}
                          onChange={(e) => setAmount(e.target.value)}
                          className={`${fieldClass} pl-7`}
                          style={fieldStyle}
                        />
                      </div>
                    </label>
                  ) : (
                    <div className="mt-4 flex flex-col gap-2">
                      {rows.map((row) => (
                        <div key={row.key} className="flex flex-wrap items-center gap-2">
                          <input type="hidden" name="lineItemKey" value={row.key} />
                          <input
                            name="lineItemTitle"
                            placeholder="Description"
                            className={`min-w-[12rem] flex-1 ${fieldClass}`}
                            style={fieldStyle}
                          />
                          <input
                            name="lineItemAmount"
                            inputMode="decimal"
                            placeholder="0.00"
                            className={`w-32 ${fieldClass}`}
                            style={fieldStyle}
                          />
                          <label className="flex items-center gap-1 whitespace-nowrap text-xs text-[var(--bt-muted)]">
                            <input type="checkbox" name="lineItemTaxable" value={row.key} />
                            Tax
                          </label>
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

                  <div className="mt-5 space-y-2">
                    <div>
                      <div className="text-xs font-medium text-[var(--bt-muted)]">Total price</div>
                      <div className="text-base font-semibold text-[var(--bt-text)]">{totalLabel}</div>
                    </div>
                    <div>
                      <div className="text-xs font-medium text-[var(--bt-muted)]">Amount paid</div>
                      <div className="text-sm text-[var(--bt-text)]">$0.00</div>
                    </div>
                  </div>
                </section>

                <section className="border-b py-5" style={{ borderColor: "var(--bt-border)" }}>
                  <div>
                    <div className="text-xs font-medium text-[var(--bt-muted)]">Balance due</div>
                    <div className="text-base font-semibold text-[var(--bt-text)]">{totalLabel}</div>
                  </div>

                  <button
                    type="button"
                    className="mt-4 flex items-center gap-1 text-sm font-semibold text-[var(--bt-text)]"
                    onClick={() => setPaymentHistoryOpen((open) => !open)}
                  >
                    <span aria-hidden className="text-[10px]">
                      {paymentHistoryOpen ? "▼" : "▶"}
                    </span>
                    Payment History
                  </button>
                  {paymentHistoryOpen ? (
                    <p className="mt-2 text-sm text-[var(--bt-muted)]">
                      Payments applied to this Invoice will be listed here.
                    </p>
                  ) : null}
                </section>

                <section className="grid gap-6 border-b py-5 lg:grid-cols-[1fr_16rem]" style={{ borderColor: "var(--bt-border)" }}>
                  <div>
                    <Label>Invoice Description</Label>
                    <textarea
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      rows={6}
                      className={`mt-1 ${fieldClass}`}
                      style={fieldStyle}
                      placeholder=""
                    />
                    <div
                      className="mt-0 flex flex-wrap gap-2 rounded-b border border-t-0 px-2 py-1.5 text-[11px] text-[var(--bt-muted)]"
                      style={{ borderColor: "var(--bt-border)", background: "var(--bt-panel-bg-muted)" }}
                      aria-hidden
                    >
                      <span>Font</span>
                      <span>Size</span>
                      <span className="font-bold">B</span>
                      <span className="italic">I</span>
                      <span className="underline">U</span>
                    </div>
                  </div>
                  <div className="rounded border p-3 text-sm" style={{ borderColor: "var(--bt-border)" }}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[var(--bt-muted)]">Invoice Status:</span>
                      <span className="font-medium text-[var(--bt-text)]">Not Invoiced</span>
                    </div>
                    <label className="mt-3 flex items-start gap-2 text-sm text-[var(--bt-text)]">
                      <input
                        type="checkbox"
                        checked={invoiceToQbo}
                        onChange={(e) => setInvoiceToQbo(e.target.checked)}
                        className="mt-0.5"
                      />
                      <span>Invoice to QuickBooks on Send</span>
                    </label>
                    {!qboInvoicePushEnabled ? (
                      <p className="mt-2 text-[11px] leading-snug text-[var(--bt-muted)]">
                        QuickBooks invoice push is paused while Buildertrend owns QB. Leave unchecked —
                        checking saves intent only until `QBO_INVOICE_PUSH_ENABLED=true` after cutover.
                      </p>
                    ) : null}
                  </div>
                </section>

                <section className="border-b py-5" style={{ borderColor: "var(--bt-border)" }}>
                  <h2 className="text-sm font-semibold text-[var(--bt-text)]">Closing Text</h2>
                  <div className="mt-3 rounded border bg-white p-4" style={{ borderColor: "var(--bt-border)" }}>
                    <div className="flex flex-wrap items-start gap-4">
                      <OutboundBrandMark
                        organizationLogoPath={props.organizationLogoPath}
                        className="h-12 w-auto max-w-[12rem] object-contain"
                      />
                      <div className="min-w-0 text-sm text-[#374151]">
                        <div className="font-semibold uppercase tracking-wide text-[#0f4c81]">
                          {props.organizationName}
                        </div>
                        <div className="mt-1 text-xs text-[#6b7280]">{companySlogan}</div>
                        {companyAddress ? <div className="mt-2 text-xs">{companyAddress}</div> : null}
                        <div className="text-xs">{companyPhone}</div>
                      </div>
                    </div>
                    <p className="mt-4 text-sm leading-relaxed text-[#374151]">
                      Thank you for the opportunity to work with you on your project. Please contact our office with any
                      questions about this invoice.
                    </p>
                  </div>
                </section>

                <section className="border-b py-5" style={{ borderColor: "var(--bt-border)" }}>
                  <Label>Message to client</Label>
                  <textarea
                    name="clientMessage"
                    value={clientMessage}
                    onChange={(e) => setClientMessage(e.target.value)}
                    rows={8}
                    className={`mt-1 ${fieldClass}`}
                    style={fieldStyle}
                    placeholder="Optional message included on the client invoice"
                  />
                  <div
                    className="mt-0 flex flex-wrap gap-2 rounded-b border border-t-0 px-2 py-1.5 text-[11px] text-[var(--bt-muted)]"
                    style={{ borderColor: "var(--bt-border)", background: "var(--bt-panel-bg-muted)" }}
                    aria-hidden
                  >
                    <span>Font</span>
                    <span>Size</span>
                    <span className="font-bold">B</span>
                    <span className="italic">I</span>
                    <span className="underline">U</span>
                  </div>
                </section>

                <section className="border-b py-4" style={{ borderColor: "var(--bt-border)" }}>
                  <h2 className="text-sm font-semibold text-[var(--bt-text)]">Internal notes</h2>
                  <textarea
                    value={internalNotes}
                    onChange={(e) => setInternalNotes(e.target.value)}
                    rows={3}
                    className={`mt-2 ${fieldClass}`}
                    style={fieldStyle}
                  />
                </section>

                <section className="py-4">
                  <h2 className="text-sm font-semibold text-[var(--bt-text)]">Attachments</h2>
                  <p className="mt-1 text-xs text-[var(--bt-muted)]">
                    Files live on the job Documents library until invoice-linked attachments ship.
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Link
                      href={filesHref}
                      className="rounded border px-3 py-1.5 text-sm font-medium text-[var(--bt-text)] hover:bg-black/5"
                      style={{ borderColor: "var(--bt-border)" }}
                      onClick={() => props.onOpenChange(false)}
                    >
                      Add
                    </Link>
                    <Link
                      href={filesHref}
                      className="rounded border px-3 py-1.5 text-sm font-medium text-[var(--bt-text)] hover:bg-black/5"
                      style={{ borderColor: "var(--bt-border)" }}
                      onClick={() => props.onOpenChange(false)}
                    >
                      Create new doc
                    </Link>
                  </div>
                </section>
              </div>
            ) : (
              <InvoiceClientPreviewPane
                data={{
                  organizationName: props.organizationName,
                  organizationLogoPath: props.organizationLogoPath,
                  companyAddress,
                  companyPhone,
                  companySlogan,
                  clientName: props.clientName ?? null,
                  clientAddress: props.clientAddress ?? null,
                  jobName: props.jobName,
                  jobAddress: props.jobAddress ?? null,
                  invoiceNumber: "(Auto)",
                  issuedOn: issuedOn || "—",
                  dueOn: dueOn || "—",
                  terms: termsLabel,
                  lines:
                    type === "FLAT"
                      ? title
                        ? [{ id: "flat", title, description: null, amount: totalLabel }]
                        : []
                      : [],
                  subtotal: totalLabel,
                  taxLabel: null,
                  tax: "$0.00",
                  total: totalLabel,
                  paid: "$0.00",
                  balance: totalLabel,
                  message: clientMessage || null,
                }}
              />
            )}
          </div>

          {state.error ? (
            <p role="alert" className="shrink-0 border-t px-4 py-2 text-xs text-red-600 sm:px-5" style={{ borderColor: "var(--bt-border)" }}>
              {state.error}
            </p>
          ) : null}

          <footer
            className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t px-4 py-3 sm:px-5"
            style={{ borderColor: "var(--bt-border)" }}
          >
            <button
              type="button"
              onClick={() => props.onOpenChange(false)}
              className="rounded border px-4 py-2 text-sm font-semibold text-[var(--bt-text)] hover:bg-black/5"
              style={{ borderColor: "var(--bt-border)" }}
            >
              Cancel
            </button>
            <button
              type="submit"
              name="intent"
              value="save"
              disabled={pending}
              className="rounded border px-4 py-2 text-sm font-semibold text-[var(--bt-text)] hover:bg-black/5 disabled:opacity-50"
              style={{ borderColor: "var(--bt-border)" }}
            >
              {pending ? "Saving…" : "Save"}
            </button>
            <button
              type="submit"
              name="intent"
              value="send"
              disabled={pending}
              className="inline-flex items-center gap-1.5 rounded px-4 py-2 text-sm font-semibold text-[var(--bt-on-primary)] disabled:opacity-50"
              style={{ background: "var(--bt-primary)" }}
            >
              <SendIcon />
              {pending ? "Sending…" : "Send"}
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
}
