import { notFound } from "next/navigation";

import { SetupNotice } from "@/app/admin/setup-notice";
import { EmptyState } from "@/components/shell/EmptyState";
import { currentAppUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { extendedCostCents, priceWithRate } from "@/lib/budget/funnel";
import { formatDate, formatMoney } from "@/lib/format";

import { approveChangeOrderAction, declineChangeOrderAction } from "./actions";
import { CreateChangeOrderForm } from "./create-change-order-form";

export const dynamic = "force-dynamic";

const STATUS_STYLE: Record<string, { bg: string; text: string }> = {
  DRAFT: { bg: "#e5e7eb", text: "#374151" },
  PENDING_APPROVAL: { bg: "#fef3c7", text: "#92400e" },
  APPROVED: { bg: "var(--bt-status-open-bg)", text: "var(--bt-status-open-text)" },
  DECLINED: { bg: "#fee2e2", text: "#991b1b" },
};

function clientPriceCents(changeOrder: {
  mode: string;
  flatClientPriceCents: number | null;
  lineItems: readonly { quantityMilli: number; unitCostCents: number; rateMode: string; rateBasisPoints: number }[];
}): number {
  if (changeOrder.mode === "FLAT") return changeOrder.flatClientPriceCents ?? 0;
  return changeOrder.lineItems.reduce((total, item) => {
    const cost = extendedCostCents(item.quantityMilli, item.unitCostCents);
    return total + priceWithRate(cost, item.rateMode as "MARKUP" | "MARGIN", item.rateBasisPoints);
  }, 0);
}

export default async function ChangeOrdersPage({ params }: PageProps<"/jobs/[jobId]/change-orders">) {
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

  const [changeOrders, costCodes] = await Promise.all([
    db.changeOrder.findMany({
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
    <div className="mx-auto flex max-w-4xl flex-col gap-4 p-6">
      <h1 className="text-xl font-semibold text-[var(--bt-text)]">Change orders — {job.name}</h1>

      <CreateChangeOrderForm jobId={job.id} costCodes={costCodes} />

      {changeOrders.length === 0 ? (
        <EmptyState title="No change orders yet" description="Change orders created for this job will appear here." />
      ) : (
        <div className="overflow-hidden rounded-lg border bg-white" style={{ borderColor: "var(--bt-border)" }}>
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b text-xs font-semibold uppercase tracking-wide text-[var(--bt-muted)]" style={{ borderColor: "var(--bt-border)" }}>
                <th className="px-4 py-3">Title</th>
                <th className="px-4 py-3">Mode</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Created</th>
                <th className="px-4 py-3 text-right">Client price</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {changeOrders.map((co) => {
                const style = STATUS_STYLE[co.status] ?? STATUS_STYLE.DRAFT;
                const canDecide = co.status === "DRAFT" || co.status === "PENDING_APPROVAL";
                return (
                  <tr key={co.id} className="border-b last:border-0" style={{ borderColor: "var(--bt-border)" }}>
                    <td className="px-4 py-3 font-medium text-[var(--bt-text)]">{co.title}</td>
                    <td className="px-4 py-3 text-[var(--bt-muted)]">{co.mode === "FLAT" ? "Flat" : "Itemized"}</td>
                    <td className="px-4 py-3">
                      <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold" style={{ background: style.bg, color: style.text }}>
                        {co.status.replace(/_/g, " ")}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-[var(--bt-muted)]">{formatDate(co.createdAt)}</td>
                    <td className="px-4 py-3 text-right text-[var(--bt-text)]">{formatMoney(clientPriceCents(co))}</td>
                    <td className="px-4 py-3">
                      {canDecide ? (
                        <div className="flex gap-2">
                          <form action={approveChangeOrderAction}>
                            <input type="hidden" name="jobId" value={job.id} />
                            <input type="hidden" name="changeOrderId" value={co.id} />
                            <button type="submit" className="text-xs font-medium text-[var(--bt-primary)] hover:underline">
                              Approve
                            </button>
                          </form>
                          <form action={declineChangeOrderAction}>
                            <input type="hidden" name="jobId" value={job.id} />
                            <input type="hidden" name="changeOrderId" value={co.id} />
                            <button type="submit" className="text-xs text-[var(--bt-muted)] hover:text-red-600 hover:underline">
                              Decline
                            </button>
                          </form>
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
