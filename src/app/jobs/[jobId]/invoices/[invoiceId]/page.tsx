import Link from "next/link";
import { notFound } from "next/navigation";

import { SetupNotice } from "@/app/admin/setup-notice";
import { CommentThread } from "@/components/comments/CommentThread";
import { currentAppUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDate, formatMoney } from "@/lib/format";
import { PAYMENT_TERMS_LABELS, daysOverdue } from "@/lib/invoicing/terms";
import { formatBasisPoints } from "@/lib/money";

import { RecordPaymentForm } from "../record-payment-form";
import { SyncToQuickBooksButton } from "../sync-to-quickbooks-button";
import { VoidInvoiceButton } from "../void-invoice-button";
import { SendInvoiceButtons } from "./send-buttons";

export const dynamic = "force-dynamic";

const STATUS_STYLE: Record<string, { bg: string; text: string }> = {
  DRAFT: { bg: "#e5e7eb", text: "#374151" },
  SENT: { bg: "color-mix(in srgb, var(--bt-primary) 14%, transparent)", text: "var(--bt-primary)" },
  PARTIALLY_PAID: { bg: "color-mix(in srgb, var(--bt-hazard) 14%, transparent)", text: "var(--bt-hazard)" },
  PAID: { bg: "var(--bt-status-open-bg)", text: "var(--bt-status-open-text)" },
  VOID: { bg: "color-mix(in srgb, var(--bt-danger) 14%, transparent)", text: "var(--bt-danger)" },
};

const METHOD_LABEL: Record<string, string> = {
  STRIPE_CARD: "Card (online)",
  STRIPE_ACH: "ACH (online)",
  QBO_SYNC: "QuickBooks",
  MANUAL: "Manual",
};

export default async function InvoiceDetailPage({ params }: PageProps<"/jobs/[jobId]/invoices/[invoiceId]">) {
  const { jobId, invoiceId } = await params;

  let user;
  try {
    user = await currentAppUser();
  } catch (error) {
    return <SetupNotice detail={error instanceof Error ? error.message : String(error)} />;
  }
  if (!user) {
    return <SetupNotice detail="No organization found. Seed the database, then reload." />;
  }

  const job = await db.job.findFirst({ where: { id: jobId, organizationId: user.organizationId } });
  if (!job) notFound();

  const invoice = await db.invoice.findFirst({
    where: { id: invoiceId, jobId: job.id, organizationId: user.organizationId },
    include: {
      lineItems: { orderBy: { sortOrder: "asc" }, include: { costCode: { select: { code: true, name: true } } } },
      payments: { orderBy: { receivedAt: "desc" } },
      creditMemos: { orderBy: { createdAt: "desc" } },
      deposits: { orderBy: { createdAt: "desc" } },
      draw: { select: { title: true } },
    },
  });
  if (!invoice) notFound();

  const qboConnection = await db.quickBooksConnection.findUnique({ where: { organizationId: user.organizationId } });
  const isQboConnected = Boolean(qboConnection && !qboConnection.disconnectedAt);

  const style = STATUS_STYLE[invoice.status] ?? STATUS_STYLE.DRAFT;
  const paidCents = invoice.payments.reduce((sum, payment) => sum + payment.amountCents, 0);
  const creditedCents = invoice.creditMemos
    .filter((memo) => memo.status === "APPLIED")
    .reduce((sum, memo) => sum + memo.amountCents, 0);
  const subtotalCents = invoice.amountCents - invoice.taxCents;
  const balanceCents = invoice.amountCents - paidCents - creditedCents;
  const lateDays =
    invoice.status === "PAID" || invoice.status === "DRAFT" || invoice.status === "VOID"
      ? 0
      : daysOverdue(invoice.dueOn, new Date());
  const canAct = invoice.status !== "VOID" && invoice.status !== "PAID";
  const hasOnlinePayment = invoice.payments.some((p) => p.method === "STRIPE_CARD" || p.method === "STRIPE_ACH");
  const hasQboPayment = invoice.payments.some((p) => p.method === "QBO_SYNC");

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4 p-6">
      <div>
        <Link href={`/jobs/${job.id}/invoices`} className="text-xs text-[var(--bt-muted)] hover:underline">
          ← Back to invoices
        </Link>
        <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-xl font-semibold text-[var(--bt-text)]">Invoice {invoice.invoiceNumber}</h1>
          <div className="flex flex-wrap items-center gap-2">
            {lateDays > 0 ? (
              <span
                className="rounded px-1.5 py-0.5 text-xs font-semibold"
                style={{ background: "color-mix(in srgb, var(--bt-danger) 14%, transparent)", color: "var(--bt-danger)" }}
              >
                {lateDays} days overdue
              </span>
            ) : null}
            <span className="rounded px-1.5 py-0.5 text-xs font-semibold" style={{ background: style.bg, color: style.text }}>
              {invoice.status.replace(/_/g, " ")}
            </span>
            <SendInvoiceButtons jobId={job.id} invoiceId={invoice.id} status={invoice.status} />
          </div>
        </div>
      </div>

      <section className="rounded-lg border bg-[var(--bt-panel-bg)] p-4" style={{ borderColor: "var(--bt-border)" }}>
        <h2 className="text-sm font-semibold text-[var(--bt-text)]">Details</h2>
        <dl className="mt-3 grid grid-cols-2 gap-x-8 gap-y-3 sm:grid-cols-4">
          <div>
            <dt className="text-xs text-[var(--bt-muted)]">Type</dt>
            <dd className="text-sm text-[var(--bt-text)]">{invoice.type.replace(/_/g, " ")}</dd>
          </div>
          <div>
            <dt className="text-xs text-[var(--bt-muted)]">Terms</dt>
            <dd className="text-sm text-[var(--bt-text)]">{PAYMENT_TERMS_LABELS[invoice.paymentTerms]}</dd>
          </div>
          <div>
            <dt className="text-xs text-[var(--bt-muted)]">Issued</dt>
            <dd className="text-sm text-[var(--bt-text)]">{formatDate(invoice.issuedOn)}</dd>
          </div>
          <div>
            <dt className="text-xs text-[var(--bt-muted)]">Due</dt>
            <dd className="text-sm text-[var(--bt-text)]">{formatDate(invoice.dueOn)}</dd>
          </div>
          <div>
            <dt className="text-xs text-[var(--bt-muted)]">Paid</dt>
            <dd className="text-sm text-[var(--bt-text)]">{formatDate(invoice.paidAt)}</dd>
          </div>
          <div>
            <dt className="text-xs text-[var(--bt-muted)]">Sent</dt>
            <dd className="text-sm text-[var(--bt-text)]">
              {invoice.lastSentAt ? formatDate(invoice.lastSentAt) : "—"}
              {invoice.sendCount > 1 ? (
                <span className="ml-1 text-xs text-[var(--bt-muted)]">({invoice.sendCount}×)</span>
              ) : null}
            </dd>
          </div>
          <div>
            {/* Whether the client has actually opened it is the first thing to check
                before chasing a payment — a client who never saw the invoice isn't late
                for the same reason as one who did. */}
            <dt className="text-xs text-[var(--bt-muted)]">Client viewed</dt>
            <dd className="text-sm text-[var(--bt-text)]">
              {invoice.clientLastViewedAt ? formatDate(invoice.clientLastViewedAt) : "Never opened"}
            </dd>
          </div>
          {invoice.draw ? (
            <div>
              <dt className="text-xs text-[var(--bt-muted)]">Draw</dt>
              <dd className="text-sm text-[var(--bt-text)]">{invoice.draw.title}</dd>
            </div>
          ) : null}
        </dl>

        {invoice.lineItems.length > 0 ? (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-max text-left text-sm">
              <thead>
                <tr
                  className="border-b text-xs font-semibold uppercase tracking-wide text-[var(--bt-muted)]"
                  style={{ borderColor: "var(--bt-border)" }}
                >
                  <th className="py-2 pr-4">Item</th>
                  <th className="py-2 pr-4">Cost code</th>
                  <th className="py-2 pr-4 text-right">Qty</th>
                  <th className="py-2 pr-4 text-right">Unit cost</th>
                  <th className="py-2 pr-4 text-right">Markup</th>
                  <th className="py-2 pr-4 text-center">Tax</th>
                  <th className="py-2 text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {invoice.lineItems.map((item) => (
                  <tr key={item.id} className="border-b last:border-0" style={{ borderColor: "var(--bt-border)" }}>
                    <td className="py-2 pr-4">
                      <div className="text-[var(--bt-text)]">{item.title}</div>
                      {item.description ? <div className="text-xs text-[var(--bt-muted)]">{item.description}</div> : null}
                    </td>
                    <td className="py-2 pr-4 text-[var(--bt-muted)]">
                      {item.costCode ? `${item.costCode.code} ${item.costCode.name}` : "—"}
                    </td>
                    <td className="py-2 pr-4 text-right text-[var(--bt-muted)]">
                      {item.quantityMilli === null ? "—" : (item.quantityMilli / 1000).toString()}
                    </td>
                    <td className="py-2 pr-4 text-right text-[var(--bt-muted)]">
                      {item.unitCostCents === null ? "—" : formatMoney(item.unitCostCents)}
                    </td>
                    <td className="py-2 pr-4 text-right text-[var(--bt-muted)]">
                      {item.rateBasisPoints === null
                        ? "—"
                        : `${formatBasisPoints(item.rateBasisPoints)} ${item.rateMode === "MARGIN" ? "margin" : "markup"}`}
                    </td>
                    <td className="py-2 pr-4 text-center text-[var(--bt-muted)]">{item.taxable ? "Yes" : "—"}</td>
                    <td className="py-2 text-right text-[var(--bt-text)]">{formatMoney(item.amountCents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}

        <div className="mt-4 flex flex-col items-end gap-1 border-t pt-3 text-sm" style={{ borderColor: "var(--bt-border)" }}>
          <div className="flex w-56 justify-between">
            <span className="text-[var(--bt-muted)]">Subtotal</span>
            <span className="text-[var(--bt-text)]">{formatMoney(subtotalCents)}</span>
          </div>
          {invoice.taxCents > 0 || invoice.taxRateBasisPoints > 0 ? (
            <div className="flex w-56 justify-between">
              <span className="text-[var(--bt-muted)]">Sales tax ({formatBasisPoints(invoice.taxRateBasisPoints)})</span>
              <span className="text-[var(--bt-text)]">{formatMoney(invoice.taxCents)}</span>
            </div>
          ) : null}
          <div className="flex w-56 justify-between">
            <span className="text-[var(--bt-muted)]">Total</span>
            <span className="text-[var(--bt-text)]">{formatMoney(invoice.amountCents)}</span>
          </div>
          <div className="flex w-56 justify-between">
            <span className="text-[var(--bt-muted)]">Paid</span>
            <span className="text-[var(--bt-text)]">{formatMoney(paidCents)}</span>
          </div>
          {creditedCents > 0 ? (
            <div className="flex w-56 justify-between">
              <span className="text-[var(--bt-muted)]">Credited</span>
              <span className="text-[var(--bt-text)]">{formatMoney(creditedCents)}</span>
            </div>
          ) : null}
          <div className="flex w-56 justify-between font-semibold">
            <span className="text-[var(--bt-text)]">Balance</span>
            <span className="text-[var(--bt-text)]">{formatMoney(balanceCents)}</span>
          </div>
        </div>

        {invoice.clientMessage ? (
          <p className="mt-4 whitespace-pre-wrap border-t pt-3 text-sm text-[var(--bt-text)]" style={{ borderColor: "var(--bt-border)" }}>
            {invoice.clientMessage}
          </p>
        ) : null}
      </section>

      <section className="rounded-lg border bg-[var(--bt-panel-bg)] p-4" style={{ borderColor: "var(--bt-border)" }}>
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-[var(--bt-text)]">Payments</h2>
          {canAct ? <RecordPaymentForm jobId={job.id} invoiceId={invoice.id} /> : null}
        </div>
        {invoice.payments.length === 0 ? (
          <p className="mt-2 text-sm text-[var(--bt-muted)]">No payments recorded yet.</p>
        ) : (
          <div className="mt-3 divide-y" style={{ borderColor: "var(--bt-border)" }}>
            {invoice.payments.map((payment) => (
              <div key={payment.id} className="flex items-center justify-between py-2 text-sm">
                <div>
                  <span className="text-[var(--bt-text)]">{METHOD_LABEL[payment.method] ?? payment.method}</span>
                  {payment.reference ? <span className="ml-2 text-xs text-[var(--bt-muted)]">Ref {payment.reference}</span> : null}
                  <div className="text-xs text-[var(--bt-muted)]">{formatDate(payment.receivedAt)}</div>
                </div>
                <span className="text-[var(--bt-text)]">{formatMoney(payment.amountCents)}</span>
              </div>
            ))}
          </div>
        )}
        {canAct ? (
          <div className="mt-3">
            <VoidInvoiceButton jobId={job.id} invoiceId={invoice.id} />
          </div>
        ) : null}
      </section>

      {invoice.creditMemos.length > 0 || invoice.deposits.length > 0 ? (
        <section className="rounded-lg border bg-[var(--bt-panel-bg)] p-4" style={{ borderColor: "var(--bt-border)" }}>
          <h2 className="text-sm font-semibold text-[var(--bt-text)]">Credits and deposits</h2>
          <div className="mt-3 divide-y" style={{ borderColor: "var(--bt-border)" }}>
            {invoice.creditMemos.map((memo) => (
              <div key={memo.id} className="flex items-center justify-between py-2 text-sm">
                <div>
                  <span className="text-[var(--bt-text)]">Credit {memo.memoNumber}</span>
                  <div className="text-xs text-[var(--bt-muted)]">
                    {memo.status.replace(/_/g, " ")}
                    {memo.reason ? ` — ${memo.reason}` : ""}
                  </div>
                </div>
                <span className="text-[var(--bt-text)]">−{formatMoney(memo.amountCents)}</span>
              </div>
            ))}
            {invoice.deposits.map((deposit) => (
              <div key={deposit.id} className="flex items-center justify-between py-2 text-sm">
                <div>
                  <span className="text-[var(--bt-text)]">Deposit — {deposit.title}</span>
                  <div className="text-xs text-[var(--bt-muted)]">{deposit.status.replace(/_/g, " ")}</div>
                </div>
                <span className="text-[var(--bt-text)]">{formatMoney(deposit.amountCents)}</span>
              </div>
            ))}
          </div>
          <p className="mt-2 text-xs text-[var(--bt-muted)]">
            An applied deposit also appears above as a payment — that is the row that settles the invoice.
          </p>
        </section>
      ) : null}

      <section className="rounded-lg border bg-[var(--bt-panel-bg)] p-4" style={{ borderColor: "var(--bt-border)" }}>
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-[var(--bt-text)]">QuickBooks status</h2>
          {isQboConnected ? (
            <SyncToQuickBooksButton jobId={job.id} invoiceId={invoice.id} label={invoice.qboInvoiceId ? "Re-sync" : "Sync to QuickBooks"} />
          ) : null}
        </div>
        {!isQboConnected ? (
          <p className="mt-2 text-sm text-[var(--bt-muted)]">
            QuickBooks isn&apos;t connected for this organization —{" "}
            <Link href="/settings/quickbooks" className="text-[var(--bt-primary)] hover:underline">
              connect it in Settings
            </Link>{" "}
            to sync invoices.
          </p>
        ) : invoice.qboInvoiceId ? (
          <p className="mt-2 text-sm text-[var(--bt-text)]">
            Synced to QuickBooks as Invoice <span className="font-mono">{invoice.qboInvoiceId}</span>.
          </p>
        ) : (
          <p className="mt-2 text-sm text-[var(--bt-muted)]">Not sent to QuickBooks yet.</p>
        )}
        {hasQboPayment ? (
          <p className="mt-1 text-xs text-[var(--bt-muted)]">A payment on this invoice was recorded via QuickBooks sync.</p>
        ) : null}
        {hasOnlinePayment ? <p className="mt-1 text-xs text-[var(--bt-muted)]">This invoice has an online (Stripe) payment recorded.</p> : null}
      </section>

      <CommentThread
        organizationId={user.organizationId}
        featureType="Invoice"
        featureId={invoice.id}
        revalidate={`/jobs/${job.id}/invoices/${invoice.id}`}
      />
    </div>
  );
}
