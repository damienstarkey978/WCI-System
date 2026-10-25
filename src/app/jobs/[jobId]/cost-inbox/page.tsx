import Link from "next/link";
import { notFound } from "next/navigation";

import { SetupNotice } from "@/app/admin/setup-notice";
import { EmptyState } from "@/components/shell/EmptyState";
import { currentAppUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDate, formatMoney } from "@/lib/format";

import { FinancialPageHeader } from "../financial-tabs";
import { approveCostInboxBillAction, voidCostInboxBillAction } from "./actions";

export const dynamic = "force-dynamic";

/**
 * "Cost Inbox" is Buildertrend's staging area for AI-scanned receipts/bills
 * awaiting a human's approve/reject before they count toward the budget —
 * here, that's every Bill created with fromOcr: true, still IN_REVIEW.
 */
export default async function CostInboxPage({ params }: PageProps<"/jobs/[jobId]/cost-inbox">) {
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

  const bills = await db.bill.findMany({
    where: { jobId: job.id, fromOcr: true, approvalStatus: "IN_REVIEW" },
    orderBy: { createdAt: "desc" },
    include: { lineItems: { include: { costCode: true } } },
  });

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4 p-6">
      <FinancialPageHeader jobName={job.name} title="Cost Inbox" />

      <div
        className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-4 py-3 text-sm"
        style={{ borderColor: "var(--bt-primary)", background: "color-mix(in srgb, var(--bt-primary) 8%, transparent)" }}
      >
        <span className="text-[var(--bt-text)]">
          <span className="font-semibold">Cost Inbox is moving to Bills.</span> Scanned receipts and bills awaiting review are also in Bills, under In review.
        </span>
        <Link href={`/jobs/${job.id}/bills?status=IN_REVIEW`} className="font-semibold text-[var(--bt-primary)] hover:underline">
          Switch to Bills
        </Link>
      </div>

      {bills.length === 0 ? (
        <EmptyState title="Inbox is clear" description="Scanned receipts and bills waiting on review will appear here." />
      ) : (
        <div className="flex flex-col gap-3">
          {bills.map((bill) => {
            const totalCents = bill.lineItems.reduce((total, item) => total + item.amountCents, 0);
            return (
              <div key={bill.id} className="rounded-lg border bg-[var(--bt-panel-bg)] p-4" style={{ borderColor: "var(--bt-border)" }}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="font-medium text-[var(--bt-text)]">{bill.vendorName}</div>
                    <div className="text-xs text-[var(--bt-muted)]">
                      {bill.billNumber ? `Bill ${bill.billNumber} · ` : ""}
                      {formatDate(bill.createdAt)}
                    </div>
                  </div>
                  <div className="text-sm font-semibold text-[var(--bt-text)]">{formatMoney(totalCents)}</div>
                </div>
                <ul className="mt-2 divide-y text-sm" style={{ borderColor: "var(--bt-border)" }}>
                  {bill.lineItems.map((item) => (
                    <li key={item.id} className="flex items-center justify-between py-1.5">
                      <span className="text-[var(--bt-text)]">
                        {item.title} <span className="text-xs text-[var(--bt-muted)]">({item.costCode.code})</span>
                      </span>
                      <span className="text-[var(--bt-text)]">{formatMoney(item.amountCents)}</span>
                    </li>
                  ))}
                </ul>
                <div className="mt-3 flex gap-3">
                  <form action={approveCostInboxBillAction}>
                    <input type="hidden" name="jobId" value={job.id} />
                    <input type="hidden" name="billId" value={bill.id} />
                    <button
                      type="submit"
                      className="rounded px-3 py-1.5 text-xs font-semibold text-[var(--bt-on-primary)]"
                      style={{ background: "var(--bt-primary)" }}
                    >
                      Approve
                    </button>
                  </form>
                  <form action={voidCostInboxBillAction}>
                    <input type="hidden" name="jobId" value={job.id} />
                    <input type="hidden" name="billId" value={bill.id} />
                    <button type="submit" className="rounded border px-3 py-1.5 text-xs font-medium text-[var(--bt-muted)] hover:text-red-600" style={{ borderColor: "var(--bt-border)" }}>
                      Reject
                    </button>
                  </form>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
