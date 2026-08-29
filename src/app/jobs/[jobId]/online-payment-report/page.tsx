import { notFound } from "next/navigation";

import { SetupNotice } from "@/app/admin/setup-notice";
import { EmptyState } from "@/components/shell/EmptyState";
import { currentAppUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDate, formatMoney } from "@/lib/format";

export const dynamic = "force-dynamic";

const METHOD_LABEL: Record<string, string> = {
  STRIPE_CARD: "Card",
  STRIPE_ACH: "ACH",
};

/**
 * Buildertrend's "Online Payment Report" is specifically the client-portal
 * (Stripe) payments — MANUAL and QBO_SYNC payments are recorded by staff, not
 * paid online, so they're out of scope here even though they still count
 * toward the invoice's balance on the Invoices tab.
 */
export default async function OnlinePaymentReportPage({ params }: PageProps<"/jobs/[jobId]/online-payment-report">) {
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

  const payments = await db.payment.findMany({
    where: {
      organizationId: user.organizationId,
      method: { in: ["STRIPE_CARD", "STRIPE_ACH"] },
      invoice: { jobId: job.id },
    },
    orderBy: { receivedAt: "desc" },
    include: { invoice: { select: { invoiceNumber: true } } },
  });

  const totalCents = payments.reduce((total, payment) => total + payment.amountCents, 0);

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4 p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-xl font-semibold text-[var(--bt-text)]">Online payment report — {job.name}</h1>
        <span className="text-sm text-[var(--bt-muted)]">
          Total online <span className="font-semibold text-[var(--bt-text)]">{formatMoney(totalCents)}</span>
        </span>
      </div>

      {payments.length === 0 ? (
        <EmptyState title="No online payments yet" description="Payments made through the client portal will appear here." />
      ) : (
        <div className="overflow-hidden rounded-lg border bg-[var(--bt-panel-bg)]" style={{ borderColor: "var(--bt-border)" }}>
          <table className="w-full text-left text-sm">
            <thead>
              <tr
                className="border-b text-xs font-semibold uppercase tracking-wide text-[var(--bt-muted)]"
                style={{ borderColor: "var(--bt-border)" }}
              >
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Invoice #</th>
                <th className="px-4 py-3">Method</th>
                <th className="px-4 py-3">Reference</th>
                <th className="px-4 py-3 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {payments.map((payment) => (
                <tr key={payment.id} className="border-b last:border-0" style={{ borderColor: "var(--bt-border)" }}>
                  <td className="px-4 py-3 text-[var(--bt-muted)]">{formatDate(payment.receivedAt)}</td>
                  <td className="px-4 py-3 font-medium text-[var(--bt-text)]">{payment.invoice.invoiceNumber}</td>
                  <td className="px-4 py-3 text-[var(--bt-text)]">{METHOD_LABEL[payment.method] ?? payment.method}</td>
                  <td className="px-4 py-3 text-[var(--bt-muted)]">{payment.reference ?? "—"}</td>
                  <td className="px-4 py-3 text-right text-[var(--bt-text)]">{formatMoney(payment.amountCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
