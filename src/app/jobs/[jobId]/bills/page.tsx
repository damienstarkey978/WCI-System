import { notFound } from "next/navigation";

import { SetupNotice } from "@/app/admin/setup-notice";
import { EmptyState } from "@/components/shell/EmptyState";
import { currentAppUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDate, formatMoney } from "@/lib/format";

import { CreateBillForm } from "./create-bill-form";

export const dynamic = "force-dynamic";

const STATUS_STYLE: Record<string, { bg: string; text: string }> = {
  IN_REVIEW: { bg: "#fef3c7", text: "#92400e" },
  APPROVED: { bg: "#dbeafe", text: "#1e40af" },
  READY_FOR_PAYMENT: { bg: "#e0e7ff", text: "#3730a3" },
  PAID: { bg: "var(--bt-status-open-bg)", text: "var(--bt-status-open-text)" },
  VOID: { bg: "#fee2e2", text: "#991b1b" },
};

export default async function BillsPage({ params }: PageProps<"/jobs/[jobId]/bills">) {
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

  const [bills, costCodes, purchaseOrders] = await Promise.all([
    db.bill.findMany({
      where: { jobId: job.id, fromOcr: false },
      orderBy: { createdAt: "desc" },
      include: { lineItems: true },
    }),
    db.costCode.findMany({
      where: { organizationId: user.organizationId, isActive: true },
      orderBy: { sortOrder: "asc" },
      select: { id: true, code: true, name: true },
    }),
    db.purchaseOrder.findMany({ where: { jobId: job.id }, select: { id: true, poNumber: true }, orderBy: { createdAt: "desc" } }),
  ]);

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4 p-6">
      <h1 className="text-xl font-semibold text-[var(--bt-text)]">Bills — {job.name}</h1>

      <CreateBillForm jobId={job.id} costCodes={costCodes} purchaseOrders={purchaseOrders} />

      {bills.length === 0 ? (
        <EmptyState title="No bills yet" description="Bills entered for this job will appear here." />
      ) : (
        <div className="overflow-hidden rounded-lg border bg-white" style={{ borderColor: "var(--bt-border)" }}>
          <table className="w-full text-left text-sm">
            <thead>
              <tr
                className="border-b text-xs font-semibold uppercase tracking-wide text-[var(--bt-muted)]"
                style={{ borderColor: "var(--bt-border)" }}
              >
                <th className="px-4 py-3">Vendor</th>
                <th className="px-4 py-3">Bill #</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Created</th>
                <th className="px-4 py-3 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {bills.map((bill) => {
                const style = STATUS_STYLE[bill.approvalStatus] ?? STATUS_STYLE.IN_REVIEW;
                const totalCents = bill.lineItems.reduce((total, item) => total + item.amountCents, 0);
                return (
                  <tr key={bill.id} className="border-b last:border-0" style={{ borderColor: "var(--bt-border)" }}>
                    <td className="px-4 py-3 font-medium text-[var(--bt-text)]">{bill.vendorName}</td>
                    <td className="px-4 py-3 text-[var(--bt-muted)]">{bill.billNumber ?? "—"}</td>
                    <td className="px-4 py-3">
                      <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold" style={{ background: style.bg, color: style.text }}>
                        {bill.approvalStatus.replace(/_/g, " ")}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-[var(--bt-muted)]">{formatDate(bill.createdAt)}</td>
                    <td className="px-4 py-3 text-right text-[var(--bt-text)]">{formatMoney(totalCents)}</td>
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
