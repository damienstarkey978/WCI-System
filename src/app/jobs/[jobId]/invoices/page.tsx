import Link from "next/link";
import { notFound } from "next/navigation";

import { SetupNotice } from "@/app/admin/setup-notice";
import { EmptyState } from "@/components/shell/EmptyState";
import { currentAppUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDate, formatMoney } from "@/lib/format";

import { CreateInvoiceForm } from "./create-invoice-form";
import { RecordPaymentForm } from "./record-payment-form";
import { VoidInvoiceButton } from "./void-invoice-button";

export const dynamic = "force-dynamic";

const STATUS_STYLE: Record<string, { bg: string; text: string }> = {
  DRAFT: { bg: "#e5e7eb", text: "#374151" },
  SENT: { bg: "#dbeafe", text: "#1e40af" },
  PARTIALLY_PAID: { bg: "#fef3c7", text: "#92400e" },
  PAID: { bg: "var(--bt-status-open-bg)", text: "var(--bt-status-open-text)" },
  VOID: { bg: "#fee2e2", text: "#991b1b" },
};

export default async function InvoicesPage({ params }: PageProps<"/jobs/[jobId]/invoices">) {
  const { jobId } = await params;

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

  const invoices = await db.invoice.findMany({
    where: { jobId: job.id },
    orderBy: { createdAt: "desc" },
    include: { payments: true },
  });

  const totals = invoices.reduce(
    (acc, invoice) => {
      const paid = invoice.payments.reduce((sum, payment) => sum + payment.amountCents, 0);
      return {
        billed: acc.billed + (invoice.status === "VOID" ? 0 : invoice.amountCents),
        paid: acc.paid + paid,
      };
    },
    { billed: 0, paid: 0 },
  );

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4 p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-xl font-semibold text-[var(--bt-text)]">Invoices — {job.name}</h1>
        <div className="flex gap-4 text-sm text-[var(--bt-muted)]">
          <span>
            Billed <span className="font-semibold text-[var(--bt-text)]">{formatMoney(totals.billed)}</span>
          </span>
          <span>
            Paid <span className="font-semibold text-[var(--bt-text)]">{formatMoney(totals.paid)}</span>
          </span>
          <span>
            Balance <span className="font-semibold text-[var(--bt-text)]">{formatMoney(totals.billed - totals.paid)}</span>
          </span>
        </div>
      </div>

      <CreateInvoiceForm jobId={job.id} />

      {invoices.length === 0 ? (
        <EmptyState title="No invoices yet" description="Invoices created for this job will appear here." />
      ) : (
        <div className="overflow-hidden rounded-lg border bg-white" style={{ borderColor: "var(--bt-border)" }}>
          <table className="w-full text-left text-sm">
            <thead>
              <tr
                className="border-b text-xs font-semibold uppercase tracking-wide text-[var(--bt-muted)]"
                style={{ borderColor: "var(--bt-border)" }}
              >
                <th className="px-4 py-3">Invoice #</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Due</th>
                <th className="px-4 py-3 text-right">Amount</th>
                <th className="px-4 py-3 text-right">Paid</th>
                <th className="px-4 py-3 text-right">Balance</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((invoice) => {
                const style = STATUS_STYLE[invoice.status] ?? STATUS_STYLE.DRAFT;
                const paidCents = invoice.payments.reduce((sum, payment) => sum + payment.amountCents, 0);
                const balanceCents = invoice.amountCents - paidCents;
                const canAct = invoice.status !== "VOID" && invoice.status !== "PAID";
                return (
                  <tr key={invoice.id} className="border-b align-top last:border-0" style={{ borderColor: "var(--bt-border)" }}>
                    <td className="px-4 py-3 font-medium">
                      <Link href={`/jobs/${job.id}/invoices/${invoice.id}`} className="text-[var(--bt-primary)] hover:underline">
                        {invoice.invoiceNumber}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold" style={{ background: style.bg, color: style.text }}>
                        {invoice.status.replace(/_/g, " ")}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-[var(--bt-muted)]">{formatDate(invoice.dueOn)}</td>
                    <td className="px-4 py-3 text-right text-[var(--bt-text)]">{formatMoney(invoice.amountCents)}</td>
                    <td className="px-4 py-3 text-right text-[var(--bt-text)]">{formatMoney(paidCents)}</td>
                    <td className="px-4 py-3 text-right text-[var(--bt-text)]">{formatMoney(balanceCents)}</td>
                    <td className="px-4 py-3">
                      {canAct ? (
                        <div className="flex flex-col items-start gap-1">
                          <RecordPaymentForm jobId={job.id} invoiceId={invoice.id} />
                          <VoidInvoiceButton jobId={job.id} invoiceId={invoice.id} />
                        </div>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
