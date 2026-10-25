import { redirect } from "next/navigation";

import { db } from "@/lib/db";
import { formatDate, formatMoney } from "@/lib/format";
import { currentVendorPortalSession } from "@/lib/vendor-portal/browser-session";

export const dynamic = "force-dynamic";

const JOB_STATUS: Record<string, string> = { PRE_SALE: "Pre-sale", OPEN: "Open", WARRANTY: "Warranty", CLOSED: "Closed" };
const PO_STATUS: Record<string, string> = {
  DRAFT: "Draft",
  PENDING_APPROVAL: "Awaiting approval",
  APPROVED: "Approved",
  DECLINED: "Declined",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};
const BID_STATUS: Record<string, string> = { INVITED: "Invited — not started", DRAFT: "Draft", SUBMITTED: "Submitted", ACCEPTED: "Accepted", DECLINED: "Declined" };

const CARD = "rounded-lg border bg-[var(--bt-panel-bg)] p-4";

/**
 * What an invited sub sees: the jobs they've been given access to, their own purchase
 * orders on those jobs, and the bid requests they've been invited to. Read-only for now —
 * accepting a PO and submitting a bid already exist on the /api/v1/vendor-portal API and
 * will get screens here next.
 */
export default async function VendorPortalJobsPage() {
  const session = await currentVendorPortalSession();
  if (!session) redirect("/vendor-portal");

  const [access, bids] = await Promise.all([
    db.vendorJobAccess.findMany({
      where: { vendorId: session.vendorId },
      include: { job: { select: { id: true, name: true, status: true, addressLine1: true, city: true, state: true } } },
      orderBy: { job: { name: "asc" } },
    }),
    // Bid invitations aren't gated by job access — see src/lib/bids/service.ts.
    db.bidSubmission.findMany({
      where: { vendorId: session.vendorId },
      orderBy: { createdAt: "desc" },
      include: { bidPackage: { select: { title: true, dueDate: true, status: true, job: { select: { name: true } } } } },
    }),
  ]);

  const visiblePoJobIds = access.filter((row) => row.canViewPurchaseOrders).map((row) => row.jobId);
  const purchaseOrders = await db.purchaseOrder.findMany({
    where: { vendorId: session.vendorId, jobId: { in: visiblePoJobIds } },
    orderBy: { createdAt: "desc" },
    include: { lineItems: { select: { quantityMilli: true, unitCostCents: true } } },
  });

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6 p-6">
      <section>
        <h1 className="text-xl font-semibold text-[var(--bt-text)]">Your jobs</h1>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {access.map(({ job }) => {
            const jobPos = purchaseOrders.filter((po) => po.jobId === job.id);
            return (
              <div key={job.id} className={CARD} style={{ borderColor: "var(--bt-border)" }}>
                <div className="font-medium text-[var(--bt-text)]">{job.name}</div>
                <div className="mt-1 text-xs text-[var(--bt-muted)]">{[job.addressLine1, job.city, job.state].filter(Boolean).join(", ") || "—"}</div>
                <div className="mt-2 flex items-center gap-2 text-xs text-[var(--bt-muted)]">
                  <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold" style={{ background: "var(--bt-status-open-bg)", color: "var(--bt-status-open-text)" }}>
                    {JOB_STATUS[job.status] ?? job.status}
                  </span>
                  {jobPos.length} purchase order{jobPos.length === 1 ? "" : "s"}
                </div>
              </div>
            );
          })}
          {access.length === 0 ? <p className="text-sm text-[var(--bt-muted)]">No jobs are shared with you yet.</p> : null}
        </div>
      </section>

      {purchaseOrders.length > 0 ? (
        <section className={CARD} style={{ borderColor: "var(--bt-border)" }}>
          <h2 className="text-sm font-semibold text-[var(--bt-text)]">Purchase orders</h2>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[32rem] text-left text-sm">
              <thead>
                <tr className="text-xs text-[var(--bt-muted)]">
                  <th className="py-1.5 pr-3 font-medium">PO</th>
                  <th className="py-1.5 pr-3 font-medium">Job</th>
                  <th className="py-1.5 pr-3 font-medium">Status</th>
                  <th className="py-1.5 text-right font-medium">Amount</th>
                </tr>
              </thead>
              <tbody>
                {purchaseOrders.map((po) => {
                  const total = po.lineItems.reduce((sum, line) => sum + Math.round((line.quantityMilli * line.unitCostCents) / 1000), 0);
                  const jobName = access.find((row) => row.jobId === po.jobId)?.job.name;
                  return (
                    <tr key={po.id} className="border-t" style={{ borderColor: "var(--bt-border)" }}>
                      <td className="py-2 pr-3 text-[var(--bt-text)]">
                        {po.poNumber}
                        {po.title ? <span className="text-[var(--bt-muted)]"> · {po.title}</span> : null}
                      </td>
                      <td className="py-2 pr-3 text-[var(--bt-muted)]">{jobName}</td>
                      <td className="py-2 pr-3 text-[var(--bt-muted)]">{PO_STATUS[po.status] ?? po.status}</td>
                      <td className="py-2 text-right tabular-nums text-[var(--bt-text)]">{formatMoney(total)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {bids.length > 0 ? (
        <section className={CARD} style={{ borderColor: "var(--bt-border)" }}>
          <h2 className="text-sm font-semibold text-[var(--bt-text)]">Bid requests</h2>
          <ul className="mt-2 divide-y" style={{ borderColor: "var(--bt-border)" }}>
            {bids.map((bid) => (
              <li key={bid.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                <div>
                  <div className="font-medium text-[var(--bt-text)]">{bid.bidPackage.title}</div>
                  <div className="text-xs text-[var(--bt-muted)]">
                    {bid.bidPackage.job.name}
                    {bid.bidPackage.dueDate ? ` · due ${formatDate(bid.bidPackage.dueDate)}` : ""}
                  </div>
                </div>
                <span className="text-xs text-[var(--bt-muted)]">{BID_STATUS[bid.status] ?? bid.status}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
