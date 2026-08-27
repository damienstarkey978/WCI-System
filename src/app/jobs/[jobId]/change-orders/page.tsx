import { notFound } from "next/navigation";

import { SetupNotice } from "@/app/admin/setup-notice";
import { EmptyState } from "@/components/shell/EmptyState";
import { currentAppUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { extendedCostCents, priceWithRate } from "@/lib/budget/funnel";
import { formatDate, formatMoney } from "@/lib/format";

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

  const changeOrders = await db.changeOrder.findMany({
    where: { jobId: job.id },
    orderBy: { createdAt: "desc" },
    include: { lineItems: true },
  });

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4 p-6">
      <h1 className="text-xl font-semibold text-[var(--bt-text)]">Change orders — {job.name}</h1>

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
              </tr>
            </thead>
            <tbody>
              {changeOrders.map((co) => {
                const style = STATUS_STYLE[co.status] ?? STATUS_STYLE.DRAFT;
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
