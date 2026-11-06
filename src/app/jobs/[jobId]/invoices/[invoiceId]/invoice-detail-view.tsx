"use client";

import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";

import { OutboundBrandMark } from "@/components/branding/OutboundBrandMark";
import {
  ChatIcon,
  CloseIcon,
  HistoryIcon,
  MaximizeIcon,
  PencilIcon,
  ShareIcon,
} from "@/components/shell/icons";
import { displayInvoiceId, INVOICE_STATUS_STYLE, invoiceStatusLabel } from "@/lib/invoicing/display";
import { formatCompanyAddress, resolveCompanySlogan, WCI_COMPANY_DEFAULTS } from "@/lib/organization/company-defaults";

import { RecordPaymentForm } from "../record-payment-form";
import { SyncToQuickBooksButton } from "../sync-to-quickbooks-button";
import { VoidInvoiceButton } from "../void-invoice-button";
import { InvoiceClientPreviewPane } from "./client-preview";
import { SendInvoiceButtons } from "./send-buttons";

export type InvoiceDetailLine = {
  readonly id: string;
  readonly title: string;
  readonly description: string | null;
  readonly costCodeLabel: string | null;
  readonly qtyLabel: string;
  readonly unitCostLabel: string;
  readonly markupLabel: string;
  readonly taxable: boolean;
  readonly amountLabel: string;
};

export type InvoiceDetailPayment = {
  readonly id: string;
  readonly methodLabel: string;
  readonly reference: string | null;
  readonly receivedAtLabel: string;
  readonly amountLabel: string;
};

export type InvoiceDetailCreditOrDeposit = {
  readonly id: string;
  readonly kind: "credit" | "deposit";
  readonly label: string;
  readonly detail: string;
  readonly amountLabel: string;
};

export type InvoiceDetailProps = {
  readonly jobId: string;
  readonly jobName: string;
  readonly jobAddress: string | null;
  readonly invoiceId: string;
  readonly organizationName: string;
  readonly organizationLogoPath: string | null;
  readonly orgAddressLine1: string | null;
  readonly orgCity: string | null;
  readonly orgState: string | null;
  readonly orgPostalCode: string | null;
  readonly orgPhone: string | null;
  readonly orgSlogan: string | null;
  readonly clientName: string | null;
  readonly clientAddress: string | null;
  readonly invoiceNumber: string;
  readonly title: string | null;
  readonly displayStatus: string;
  readonly termsLabel: string;
  readonly issuedOnLabel: string;
  readonly dueOnLabel: string;
  readonly paidAtLabel: string;
  readonly lastSentAtLabel: string;
  readonly sentByLabel: string | null;
  readonly clientViewedLabel: string;
  readonly taxLabel: string;
  readonly subtotalLabel: string;
  readonly taxAmountLabel: string;
  readonly totalLabel: string;
  readonly paidLabel: string;
  readonly creditedLabel: string | null;
  readonly balanceLabel: string;
  readonly clientMessage: string | null;
  readonly lines: readonly InvoiceDetailLine[];
  readonly payments: readonly InvoiceDetailPayment[];
  readonly creditsAndDeposits: readonly InvoiceDetailCreditOrDeposit[];
  readonly canAct: boolean;
  readonly isQboConnected: boolean;
  readonly qboInvoiceId: string | null;
  readonly hasQboPayment: boolean;
  readonly hasOnlinePayment: boolean;
  readonly initialTab?: "details" | "preview";
  /** Server-rendered CommentThread slot — never import CommentThread here (pulls db/pg into the browser). */
  readonly comments: ReactNode;
};

function EllipsisIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className={className} aria-hidden>
      <circle cx="4" cy="10" r="1.5" />
      <circle cx="10" cy="10" r="1.5" />
      <circle cx="16" cy="10" r="1.5" />
    </svg>
  );
}

function Field({ label, children, info }: { label: string; children: React.ReactNode; info?: boolean }) {
  return (
    <div className="min-w-0">
      <div className="inline-flex items-center gap-1 text-xs font-medium text-[var(--bt-muted)]">
        {label}
        {info ? (
          <span className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-full bg-sky-100 text-[9px] font-bold text-sky-600" title={label}>
            i
          </span>
        ) : null}
      </div>
      <div className="mt-0.5 text-sm text-[var(--bt-text)]">{children}</div>
    </div>
  );
}

/**
 * Buildertrend invoice detail chrome: modal shell, Details / Client preview tabs,
 * invoice information + client price grids, company letterhead, internal notes /
 * attachments cards, footer … / Edit / Resend.
 */
export function InvoiceDetailView(props: InvoiceDetailProps) {
  const router = useRouter();
  const [tab, setTab] = useState<"details" | "preview">(props.initialTab ?? "details");
  const [menuOpen, setMenuOpen] = useState(false);
  const [editing, setEditing] = useState(false);

  const shortId = displayInvoiceId(props.invoiceNumber);
  const statusStyle = INVOICE_STATUS_STYLE[props.displayStatus] ?? INVOICE_STATUS_STYLE.DRAFT;
  const listHref = `/jobs/${props.jobId}/invoices`;

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

  function close() {
    router.push(listHref);
  }

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center sm:items-center sm:p-3">
      <button type="button" className="absolute inset-0 bg-black/40" aria-label="Close invoice" onClick={close} />
      <div
        className="relative flex max-h-[96vh] w-full max-w-5xl flex-col overflow-hidden rounded-t-lg bg-[var(--bt-panel-bg)] shadow-xl sm:max-h-[92vh] sm:rounded-lg"
        role="dialog"
        aria-modal="true"
        aria-label="Invoice"
      >
        <header className="flex shrink-0 items-start justify-between gap-3 border-b px-4 py-3 sm:px-5" style={{ borderColor: "var(--bt-border)" }}>
          <div className="min-w-0">
            <div className="truncate text-xs text-[var(--bt-muted)]">{props.jobName}</div>
            <h1 className="text-lg font-semibold text-[var(--bt-text)]">Invoice</h1>
          </div>
          <div className="flex shrink-0 items-center gap-0.5">
            <span className="rounded p-1.5 text-[#64748b]" title="Share" aria-hidden>
              <ShareIcon className="h-4 w-4" />
            </span>
            <a
              href="#invoice-comments"
              className="rounded p-1.5 text-[#0ea5e9] hover:bg-sky-50"
              title="Comments"
              aria-label="Comments"
            >
              <ChatIcon className="h-4 w-4" />
            </a>
            <a
              href="#invoice-payments"
              className="rounded p-1.5 text-[#d97706] hover:bg-amber-50"
              title="History"
              aria-label="History"
            >
              <HistoryIcon className="h-4 w-4" />
            </a>
            <Link
              href={listHref}
              className="rounded p-1.5 text-[#0ea5e9] hover:bg-sky-50"
              title="Back to list"
              aria-label="Back to list"
            >
              <MaximizeIcon className="h-4 w-4" />
            </Link>
            <button type="button" onClick={close} aria-label="Close" className="rounded p-1.5 text-[var(--bt-muted)] hover:bg-black/5">
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
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <h2 className="text-sm font-semibold text-[var(--bt-text)]">Invoice information</h2>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--bt-muted)]">
                    {props.sentByLabel ? <span>{props.sentByLabel}</span> : null}
                    <span
                      className="rounded px-2 py-0.5 text-[11px] font-semibold"
                      style={{ background: statusStyle.bg, color: statusStyle.text }}
                    >
                      {invoiceStatusLabel(props.displayStatus)}
                    </span>
                  </div>
                </div>

                <div className="mt-4 grid gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-4">
                  <Field label="Title">
                    {editing ? (
                      <span className="text-[var(--bt-muted)]">{props.title ?? "—"}</span>
                    ) : (
                      props.title ?? "—"
                    )}
                  </Field>
                  <Field label="ID #" info>
                    {shortId}
                  </Field>
                  <Field label="Client last viewed">{props.clientViewedLabel}</Field>
                  <Field label="Date paid">{props.paidAtLabel}</Field>
                  <Field label="Invoice date">{props.issuedOnLabel}</Field>
                  <Field label="Payment terms" info>
                    {props.termsLabel || "—"}
                  </Field>
                  <Field label="Due date">{props.dueOnLabel}</Field>
                </div>
              </section>

              <section className="border-b py-5" style={{ borderColor: "var(--bt-border)" }}>
                <h2 className="text-sm font-semibold text-[var(--bt-text)]">Client price</h2>
                <div className="mt-4 grid gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-4">
                  <Field label="Taxes">{props.taxLabel}</Field>
                  <Field label="Client price">{props.totalLabel}</Field>
                  <Field label="Total price">
                    <span className="font-semibold">{props.totalLabel}</span>
                  </Field>
                  <Field label="Amount paid">{props.paidLabel}</Field>
                </div>

                {props.lines.length > 0 ? (
                  <div className="mt-5 overflow-x-auto rounded border" style={{ borderColor: "var(--bt-border)" }}>
                    <table className="w-full min-w-max text-left text-sm">
                      <thead>
                        <tr
                          className="border-b text-[10px] font-semibold uppercase tracking-wide text-[var(--bt-muted)]"
                          style={{ borderColor: "var(--bt-border)", background: "var(--bt-panel-bg-muted)" }}
                        >
                          <th className="px-3 py-2">Item</th>
                          <th className="px-3 py-2">Cost code</th>
                          <th className="px-3 py-2 text-right">Qty</th>
                          <th className="px-3 py-2 text-right">Unit cost</th>
                          <th className="px-3 py-2 text-right">Markup</th>
                          <th className="px-3 py-2 text-center">Tax</th>
                          <th className="px-3 py-2 text-right">Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {props.lines.map((item) => (
                          <tr key={item.id} className="border-b last:border-0" style={{ borderColor: "var(--bt-border)" }}>
                            <td className="px-3 py-2">
                              <div className="text-[var(--bt-text)]">{item.title}</div>
                              {item.description ? <div className="text-xs text-[var(--bt-muted)]">{item.description}</div> : null}
                            </td>
                            <td className="px-3 py-2 text-[var(--bt-muted)]">{item.costCodeLabel ?? "—"}</td>
                            <td className="px-3 py-2 text-right text-[var(--bt-muted)]">{item.qtyLabel}</td>
                            <td className="px-3 py-2 text-right text-[var(--bt-muted)]">{item.unitCostLabel}</td>
                            <td className="px-3 py-2 text-right text-[var(--bt-muted)]">{item.markupLabel}</td>
                            <td className="px-3 py-2 text-center text-[var(--bt-muted)]">{item.taxable ? "Yes" : "—"}</td>
                            <td className="px-3 py-2 text-right text-[var(--bt-text)]">{item.amountLabel}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : null}

                <div className="mt-4 flex flex-col items-end gap-1 text-sm">
                  <div className="flex w-56 justify-between">
                    <span className="text-[var(--bt-muted)]">Subtotal</span>
                    <span>{props.subtotalLabel}</span>
                  </div>
                  {props.taxLabel !== "No Tax" ? (
                    <div className="flex w-56 justify-between">
                      <span className="text-[var(--bt-muted)]">{props.taxLabel}</span>
                      <span>{props.taxAmountLabel}</span>
                    </div>
                  ) : null}
                  <div className="flex w-56 justify-between font-semibold">
                    <span>Total</span>
                    <span>{props.totalLabel}</span>
                  </div>
                  <div className="flex w-56 justify-between">
                    <span className="text-[var(--bt-muted)]">Paid</span>
                    <span>{props.paidLabel}</span>
                  </div>
                  {props.creditedLabel ? (
                    <div className="flex w-56 justify-between">
                      <span className="text-[var(--bt-muted)]">Credited</span>
                      <span>{props.creditedLabel}</span>
                    </div>
                  ) : null}
                  <div className="flex w-56 justify-between border-t pt-1 font-semibold" style={{ borderColor: "var(--bt-border)" }}>
                    <span>Balance</span>
                    <span>{props.balanceLabel}</span>
                  </div>
                </div>
              </section>

              <section className="border-b py-5" style={{ borderColor: "var(--bt-border)" }}>
                <div className="rounded border bg-white p-4" style={{ borderColor: "var(--bt-border)" }}>
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
                  {props.clientMessage ? (
                    <div className="mt-4 whitespace-pre-wrap border-t pt-3 text-sm text-[#374151]" style={{ borderColor: "#e5e7eb" }}>
                      {props.clientMessage}
                    </div>
                  ) : null}
                </div>
              </section>

              <section className="border-b py-4" style={{ borderColor: "var(--bt-border)" }}>
                <div className="overflow-hidden rounded border" style={{ borderColor: "var(--bt-border)" }}>
                  <div className="border-b px-3 py-2 text-xs font-semibold" style={{ borderColor: "var(--bt-border)", background: "var(--bt-panel-bg-muted)" }}>
                    Internal notes
                  </div>
                  <div className="px-3 py-3 text-sm text-[var(--bt-muted)]">—</div>
                </div>
              </section>

              <section className="border-b py-4" style={{ borderColor: "var(--bt-border)" }}>
                <div className="overflow-hidden rounded border" style={{ borderColor: "var(--bt-border)" }}>
                  <div className="border-b px-3 py-2 text-xs font-semibold" style={{ borderColor: "var(--bt-border)", background: "var(--bt-panel-bg-muted)" }}>
                    Attachments
                  </div>
                  <div className="px-3 py-6 text-sm text-[var(--bt-muted)]" />
                </div>
              </section>

              <section id="invoice-payments" className="border-b py-5" style={{ borderColor: "var(--bt-border)" }}>
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-sm font-semibold text-[var(--bt-text)]">Payment history</h2>
                  {props.canAct ? <RecordPaymentForm jobId={props.jobId} invoiceId={props.invoiceId} /> : null}
                </div>
                {props.payments.length === 0 ? (
                  <p className="mt-2 text-sm text-[var(--bt-muted)]">No payments recorded yet.</p>
                ) : (
                  <div className="mt-3 divide-y" style={{ borderColor: "var(--bt-border)" }}>
                    {props.payments.map((payment) => (
                      <div key={payment.id} className="flex items-center justify-between py-2 text-sm">
                        <div>
                          <span className="text-[var(--bt-text)]">{payment.methodLabel}</span>
                          {payment.reference ? (
                            <span className="ml-2 text-xs text-[var(--bt-muted)]">Ref {payment.reference}</span>
                          ) : null}
                          <div className="text-xs text-[var(--bt-muted)]">{payment.receivedAtLabel}</div>
                        </div>
                        <span className="text-[var(--bt-text)]">{payment.amountLabel}</span>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              {props.creditsAndDeposits.length > 0 ? (
                <section className="border-b py-5" style={{ borderColor: "var(--bt-border)" }}>
                  <h2 className="text-sm font-semibold text-[var(--bt-text)]">Credits and deposits</h2>
                  <div className="mt-3 divide-y" style={{ borderColor: "var(--bt-border)" }}>
                    {props.creditsAndDeposits.map((row) => (
                      <div key={row.id} className="flex items-center justify-between py-2 text-sm">
                        <div>
                          <span className="text-[var(--bt-text)]">{row.label}</span>
                          <div className="text-xs text-[var(--bt-muted)]">{row.detail}</div>
                        </div>
                        <span className="text-[var(--bt-text)]">{row.amountLabel}</span>
                      </div>
                    ))}
                  </div>
                </section>
              ) : null}

              <section className="border-b py-5" style={{ borderColor: "var(--bt-border)" }}>
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-sm font-semibold text-[var(--bt-text)]">Send to QuickBooks</h2>
                  {props.isQboConnected ? (
                    <SyncToQuickBooksButton
                      jobId={props.jobId}
                      invoiceId={props.invoiceId}
                      label={props.qboInvoiceId ? "Re-sync" : "Sync to QuickBooks"}
                    />
                  ) : null}
                </div>
                {!props.isQboConnected ? (
                  <p className="mt-2 text-sm text-[var(--bt-muted)]">
                    QuickBooks isn&apos;t connected —{" "}
                    <Link href="/settings/quickbooks" className="text-[var(--bt-primary)] hover:underline">
                      connect it in Settings
                    </Link>
                    .
                  </p>
                ) : props.qboInvoiceId ? (
                  <p className="mt-2 text-sm text-[var(--bt-text)]">
                    Synced as Invoice <span className="font-mono">{props.qboInvoiceId}</span>.
                  </p>
                ) : (
                  <p className="mt-2 text-sm text-[var(--bt-muted)]">Not sent to QuickBooks yet.</p>
                )}
                {props.hasQboPayment ? (
                  <p className="mt-1 text-xs text-[var(--bt-muted)]">A payment was recorded via QuickBooks sync.</p>
                ) : null}
                {props.hasOnlinePayment ? (
                  <p className="mt-1 text-xs text-[var(--bt-muted)]">This invoice has an online (Stripe) payment recorded.</p>
                ) : null}
              </section>

              <section id="invoice-comments" className="py-5">
                {props.comments}
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
                clientName: props.clientName,
                clientAddress: props.clientAddress,
                jobName: props.jobName,
                jobAddress: props.jobAddress,
                invoiceNumber: shortId,
                issuedOn: props.issuedOnLabel,
                dueOn: props.dueOnLabel,
                terms: props.termsLabel,
                lines: props.lines.map((line) => ({
                  id: line.id,
                  title: line.title,
                  description: line.description,
                  amount: line.amountLabel,
                })),
                subtotal: props.subtotalLabel,
                taxLabel: props.taxLabel !== "No Tax" ? props.taxLabel : null,
                tax: props.taxAmountLabel,
                total: props.totalLabel,
                paid: props.paidLabel,
                balance: props.balanceLabel,
                message: props.clientMessage,
              }}
            />
          )}
        </div>

        <footer
          className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t px-4 py-3 sm:px-5"
          style={{ borderColor: "var(--bt-border)" }}
        >
          <div className="relative mr-auto flex items-center gap-1">
            <button
              type="button"
              aria-label="More actions"
              onClick={() => setMenuOpen((open) => !open)}
              className="rounded p-2 text-[var(--bt-muted)] hover:bg-black/5"
            >
              <EllipsisIcon className="h-4 w-4" />
            </button>
            {menuOpen ? (
              <div
                className="absolute bottom-full left-0 mb-1 min-w-[9rem] rounded border bg-white py-1 text-sm shadow-lg"
                style={{ borderColor: "var(--bt-border)" }}
              >
                <button
                  type="button"
                  className="block w-full px-3 py-1.5 text-left hover:bg-black/5"
                  onClick={() => {
                    window.print();
                    setMenuOpen(false);
                  }}
                >
                  Print
                </button>
                {props.canAct ? (
                  <div className="border-t px-3 py-1.5" style={{ borderColor: "var(--bt-border)" }}>
                    <VoidInvoiceButton jobId={props.jobId} invoiceId={props.invoiceId} />
                  </div>
                ) : null}
              </div>
            ) : null}
            <button
              type="button"
              aria-label="Edit"
              title={editing ? "Done" : "Edit"}
              onClick={() => setEditing((value) => !value)}
              className="rounded p-2 text-[var(--bt-muted)] hover:bg-black/5"
              style={editing ? { color: "var(--bt-primary)" } : undefined}
            >
              <PencilIcon className="h-4 w-4" />
            </button>
          </div>

          {tab === "preview" && props.canAct ? (
            <RecordPaymentForm jobId={props.jobId} invoiceId={props.invoiceId} />
          ) : null}
          <SendInvoiceButtons jobId={props.jobId} invoiceId={props.invoiceId} status={props.displayStatus} variant="bt" />
        </footer>
      </div>
    </div>
  );
}
