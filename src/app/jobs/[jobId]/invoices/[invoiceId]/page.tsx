import Link from "next/link";
import { notFound } from "next/navigation";

import { SetupNotice } from "@/app/admin/setup-notice";
import { CommentThread } from "@/components/comments/CommentThread";
import { currentAppUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDate, formatMoney } from "@/lib/format";

import { RecordPaymentForm } from "../record-payment-form";
import { SyncToQuickBooksButton } from "../sync-to-quickbooks-button";
import { VoidInvoiceButton } from "../void-invoice-button";

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
      lineItems: { orderBy: { sortOrder: "asc" } },
      payments: { orderBy: { receivedAt: "desc" } },
      draw: { select: { title: true } },
    },
  });
  if (!invoice) notFound();

  const qboConnection = await db.quickBooksConnection.findUnique({ where: { organizationId: user.organizationId } });
  const isQboConnected = Boolean(qboConnection && !qboConnection.disconnectedAt);

  const style = STATUS_STYLE[invoice.status] ?? STATUS_STYLE.DRAFT;
  const paidCents = invoice.payments.reduce((sum, payment) => sum + payment.amountCents, 0);
  const balanceCents = invoice.amountCents - paidCents;
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
          <span className="rounded px-1.5 py-0.5 text-xs font-semibold" style={{ background: style.bg, color: style.text }}>
            {invoice.status.replace(/_/g, " ")}
          </span>
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
          {invoice.draw ? (
            <div className="col-span-2">
              <dt className="text-xs text-[var(--bt-muted)]">Draw</dt>
              <dd className="text-sm text-[var(--bt-text)]">{invoice.draw.title}</dd>
            </div>
          ) : null}
        </dl>

        {invoice.lineItems.length > 0 ? (
          <div className="mt-4 divide-y" style={{ borderColor: "var(--bt-border)" }}>
            {invoice.lineItems.map((item) => (
              <div key={item.id} className="flex items-center justify-between py-2 text-sm">
                <div>
                  <div className="text-[var(--bt-text)]">{item.title}</div>
                  {item.description ? <div className="text-xs text-[var(--bt-muted)]">{item.description}</div> : null}
                </div>
                <div className="text-[var(--bt-text)]">{formatMoney(item.amountCents)}</div>
              </div>
            ))}
          </div>
        ) : null}

        <div className="mt-4 flex flex-col items-end gap-1 border-t pt-3 text-sm" style={{ borderColor: "var(--bt-border)" }}>
          <div className="flex w-48 justify-between">
            <span className="text-[var(--bt-muted)]">Amount</span>
            <span className="text-[var(--bt-text)]">{formatMoney(invoice.amountCents)}</span>
          </div>
          <div className="flex w-48 justify-between">
            <span className="text-[var(--bt-muted)]">Paid</span>
            <span className="text-[var(--bt-text)]">{formatMoney(paidCents)}</span>
          </div>
          <div className="flex w-48 justify-between font-semibold">
            <span className="text-[var(--bt-text)]">Balance</span>
            <span className="text-[var(--bt-text)]">{formatMoney(balanceCents)}</span>
          </div>
        </div>
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
