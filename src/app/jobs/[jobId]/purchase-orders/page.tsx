import { notFound } from "next/navigation";

import { SetupNotice } from "@/app/admin/setup-notice";
import { EmptyState } from "@/components/shell/EmptyState";
import { extendedCostCents } from "@/lib/budget/funnel";
import { currentAppUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDate, formatMoney } from "@/lib/format";

import { CreatePoForm } from "./create-po-form";

export const dynamic = "force-dynamic";

const STATUS_STYLE: Record<string, { bg: string; text: string }> = {
  DRAFT: { bg: "#e5e7eb", text: "#374151" },
  PENDING_APPROVAL: { bg: "#fef3c7", text: "#92400e" },
  APPROVED: { bg: "var(--bt-status-open-bg)", text: "var(--bt-status-open-text)" },
  DECLINED: { bg: "#fee2e2", text: "#991b1b" },
  COMPLETED: { bg: "#e0e7ff", text: "#3730a3" },
  CANCELLED: { bg: "#fee2e2", text: "#991b1b" },
};

export default async function PurchaseOrdersPage({ params }: PageProps<"/jobs/[jobId]/purchase-orders">) {
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

  const [purchaseOrders, costCodes] = await Promise.all([
    db.purchaseOrder.findMany({
      where: { jobId: job.id },
      orderBy: { createdAt: "desc" },
      include: { lineItems: true },
    }),
    db.costCode.findMany({
      where: { organizationId: user.organizationId, isActive: true },
      orderBy: { sortOrder: "asc" },
      select: { id: true, code: true, name: true },
    }),
  ]);

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4 p-6">
      <h1 className="text-xl font-semibold text-[var(--bt-text)]">Purchase orders — {job.name}</h1>

      <CreatePoForm jobId={job.id} costCodes={costCodes} />

      {purchaseOrders.length === 0 ? (
        <EmptyState title="No purchase orders yet" description="Purchase orders created for this job will appear here." />
      ) : (
        <div className="overflow-hidden rounded-lg border bg-white" style={{ borderColor: "var(--bt-border)" }}>
          <table className="w-full text-left text-sm">
            <thead>
              <tr
                className="border-b text-xs font-semibold uppercase tracking-wide text-[var(--bt-muted)]"
                style={{ borderColor: "var(--bt-border)" }}
              >
                <th className="px-4 py-3">PO #</th>
                <th className="px-4 py-3">Vendor</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Created</th>
                <th className="px-4 py-3 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {purchaseOrders.map((po) => {
                const style = STATUS_STYLE[po.status] ?? STATUS_STYLE.DRAFT;
                const totalCents = po.lineItems.reduce((total, item) => total + extendedCostCents(item.quantityMilli, item.unitCostCents), 0);
                return (
                  <tr key={po.id} className="border-b last:border-0" style={{ borderColor: "var(--bt-border)" }}>
                    <td className="px-4 py-3 font-medium text-[var(--bt-text)]">
                      {po.poNumber}
                      {po.poSuffix ? `-${po.poSuffix}` : ""}
                    </td>
                    <td className="px-4 py-3 text-[var(--bt-text)]">{po.vendorName}</td>
                    <td className="px-4 py-3">
                      <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold" style={{ background: style.bg, color: style.text }}>
                        {po.status.replace(/_/g, " ")}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-[var(--bt-muted)]">{formatDate(po.createdAt)}</td>
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
