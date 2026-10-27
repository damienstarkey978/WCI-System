import { notFound } from "next/navigation";

import { SetupNotice } from "@/app/admin/setup-notice";
import { EmptyState } from "@/components/shell/EmptyState";
import { PaymentCardIcon } from "@/components/shell/icons";
import { currentAppUser } from "@/lib/auth";
import { db } from "@/lib/db";

import { FinancialPageHeader } from "../financial-tabs";
import { OnlinePaymentsGrid } from "./payments-grid";

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

  const rows = payments.map((payment) => ({
    id: payment.id,
    receivedAt: payment.receivedAt.toISOString(),
    invoiceNumber: payment.invoice.invoiceNumber,
    method: METHOD_LABEL[payment.method] ?? payment.method,
    reference: payment.reference,
    amountCents: payment.amountCents,
  }));

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4 p-6">
      <FinancialPageHeader jobName={job.name} title="Payments" />

      {rows.length === 0 ? (
        <EmptyState
          icon={<PaymentCardIcon className="h-10 w-10" />}
          title="No online payments yet"
          description="Payments made through the client portal will appear here."
        />
      ) : (
        <OnlinePaymentsGrid rows={rows} />
      )}
    </div>
  );
}
