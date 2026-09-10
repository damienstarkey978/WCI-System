import Link from "next/link";
import { notFound } from "next/navigation";

import { SetupNotice } from "@/app/admin/setup-notice";
import { EmptyState } from "@/components/shell/EmptyState";
import { currentAppUser } from "@/lib/auth";
import { billStatusCounts, billingInboxAddress } from "@/lib/bills/intake";
import { db } from "@/lib/db";
import { formatDate, formatMoney } from "@/lib/format";

import { BillUploader } from "./bill-uploader";
import { CreateBillForm } from "./create-bill-form";
import { SyncToQuickBooksButton } from "./sync-to-quickbooks-button";

export const dynamic = "force-dynamic";

const STATUS_STYLE: Record<string, { bg: string; text: string }> = {
  INBOX: { bg: "#e5e7eb", text: "#374151" },
  IN_REVIEW: { bg: "color-mix(in srgb, var(--bt-hazard) 14%, transparent)", text: "var(--bt-hazard)" },
  APPROVED: { bg: "color-mix(in srgb, var(--bt-primary) 14%, transparent)", text: "var(--bt-primary)" },
  READY_FOR_PAYMENT: { bg: "color-mix(in srgb, var(--bt-primary) 14%, transparent)", text: "var(--bt-primary)" },
  PAID: { bg: "var(--bt-status-open-bg)", text: "var(--bt-status-open-text)" },
  VOID: { bg: "color-mix(in srgb, var(--bt-danger) 14%, transparent)", text: "var(--bt-danger)" },
};

/** The pipeline, in the order the office works it. ALL is unfiltered. */
const TABS = [
  { key: "INBOX", label: "Inbox" },
  { key: "IN_REVIEW", label: "In review" },
  { key: "READY_FOR_PAYMENT", label: "Ready for payment" },
  { key: "PAID", label: "Paid" },
  { key: "ALL", label: "All bills" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

function isTabKey(value: string | undefined): value is TabKey {
  return TABS.some((tab) => tab.key === value);
}

export default async function BillsPage({ params, searchParams }: PageProps<"/jobs/[jobId]/bills">) {
  const { jobId } = await params;
  const { status } = await searchParams;

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

  const activeTab: TabKey = isTabKey(typeof status === "string" ? status : undefined)
    ? (status as TabKey)
    : "ALL";

  // ALL deliberately hides voided bills: a voided bill isn't something the office
  // still has to act on, and including it would make the total row disagree with
  // what the job actually owes. billStatusCounts() excludes them from ALL too.
  const statusFilter =
    activeTab === "ALL" ? { approvalStatus: { not: "VOID" as const } } : { approvalStatus: activeTab };

  const [bills, counts, costCodes, purchaseOrders, qboConnection, organization] = await Promise.all([
    db.bill.findMany({
      where: { jobId: job.id, ...statusFilter },
      orderBy: { createdAt: "desc" },
      include: {
        lineItems: true,
        createdByUser: { select: { name: true, email: true } },
        purchaseOrder: { select: { id: true, poNumber: true, title: true } },
      },
    }),
    billStatusCounts(user.organizationId, job.id),
    db.costCode.findMany({
      where: { organizationId: user.organizationId, isActive: true },
      orderBy: { sortOrder: "asc" },
      select: { id: true, code: true, name: true },
    }),
    db.purchaseOrder.findMany({ where: { jobId: job.id }, select: { id: true, poNumber: true }, orderBy: { createdAt: "desc" } }),
    db.quickBooksConnection.findUnique({ where: { organizationId: user.organizationId } }),
    db.organization.findUniqueOrThrow({ where: { id: user.organizationId }, select: { slug: true } }),
  ]);
  const isQboConnected = Boolean(qboConnection && !qboConnection.disconnectedAt);

  const totalCents = bills.reduce(
    (total, bill) => total + bill.lineItems.reduce((sum, item) => sum + item.amountCents, 0),
    0,
  );

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4 p-6">
      <h1 className="text-xl font-semibold text-[var(--bt-text)]">Bills — {job.name}</h1>

      <BillUploader jobId={job.id} inboxAddress={billingInboxAddress(organization.slug)} />

      <nav className="flex flex-wrap gap-1 border-b" style={{ borderColor: "var(--bt-border)" }}>
        {TABS.map((tab) => {
          const isActive = tab.key === activeTab;
          const count = counts[tab.key];
          return (
            <Link
              key={tab.key}
              href={`/jobs/${job.id}/bills?status=${tab.key}`}
              className="-mb-px border-b-2 px-3 py-2 text-sm font-medium transition"
              style={{
                borderColor: isActive ? "var(--bt-primary)" : "transparent",
                color: isActive ? "var(--bt-primary)" : "var(--bt-muted)",
              }}
            >
              {tab.label}
              <span className="ml-1.5 rounded bg-black/5 px-1.5 py-0.5 text-[10px] font-semibold">{count}</span>
            </Link>
          );
        })}
      </nav>

      <CreateBillForm jobId={job.id} costCodes={costCodes} purchaseOrders={purchaseOrders} />

      {bills.length === 0 ? (
        <EmptyState
          title={activeTab === "ALL" ? "No bills yet" : `Nothing in ${TABS.find((t) => t.key === activeTab)?.label}`}
          description="Drop a receipt above, forward one to the inbox address, or add a bill by hand."
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-[var(--bt-panel-bg)]" style={{ borderColor: "var(--bt-border)" }}>
          <table className="w-full text-left text-sm">
            <thead>
              <tr
                className="border-b text-xs font-semibold uppercase tracking-wide text-[var(--bt-muted)]"
                style={{ borderColor: "var(--bt-border)" }}
              >
                <th className="px-4 py-3">Title</th>
                <th className="px-4 py-3">Pay to</th>
                <th className="px-4 py-3">Bill #</th>
                <th className="px-4 py-3">PO</th>
                <th className="px-4 py-3">Created by</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Invoice date</th>
                <th className="px-4 py-3 text-right">Amount</th>
                {isQboConnected ? <th className="px-4 py-3 text-right">QuickBooks</th> : null}
              </tr>
            </thead>
            <tbody>
              {bills.map((bill) => {
                const style = STATUS_STYLE[bill.approvalStatus] ?? STATUS_STYLE.IN_REVIEW;
                const billTotal = bill.lineItems.reduce((total, item) => total + item.amountCents, 0);
                return (
                  <tr key={bill.id} className="border-b last:border-0" style={{ borderColor: "var(--bt-border)" }}>
                    <td className="px-4 py-3 text-[var(--bt-text)]">
                      {bill.title ?? "—"}
                      {bill.fromOcr ? (
                        <span className="ml-1.5 rounded bg-black/5 px-1 py-0.5 text-[10px] text-[var(--bt-muted)]">AI</span>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 font-medium text-[var(--bt-text)]">{bill.vendorName}</td>
                    <td className="px-4 py-3 text-[var(--bt-muted)]">{bill.billNumber ?? "—"}</td>
                    <td className="px-4 py-3">
                      {bill.purchaseOrder ? (
                        <Link
                          href={`/jobs/${job.id}/purchase-orders/${bill.purchaseOrder.id}`}
                          className="hover:underline"
                          style={{ color: "var(--bt-primary)" }}
                        >
                          {bill.purchaseOrder.poNumber}
                          {bill.purchaseOrder.title ? ` — ${bill.purchaseOrder.title}` : ""}
                        </Link>
                      ) : (
                        <span className="text-[var(--bt-muted)]">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-[var(--bt-muted)]">
                      {bill.createdByUser?.name ?? bill.createdByUser?.email ?? "—"}
                    </td>
                    <td className="px-4 py-3">
                      <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold" style={{ background: style.bg, color: style.text }}>
                        {bill.approvalStatus.replace(/_/g, " ")}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-[var(--bt-muted)]">
                      {bill.issuedOn ? formatDate(bill.issuedOn) : formatDate(bill.createdAt)}
                    </td>
                    <td className="px-4 py-3 text-right text-[var(--bt-text)]">{formatMoney(billTotal)}</td>
                    {isQboConnected ? (
                      <td className="px-4 py-3 text-right">
                        {bill.qboBillId ? (
                          <span className="text-xs text-[var(--bt-muted)]">Synced</span>
                        ) : (
                          <SyncToQuickBooksButton jobId={job.id} billId={bill.id} label="Sync" />
                        )}
                      </td>
                    ) : null}
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t font-semibold text-[var(--bt-text)]" style={{ borderColor: "var(--bt-border)" }}>
                <td className="px-4 py-3" colSpan={7}>
                  {bills.length} {bills.length === 1 ? "bill" : "bills"}
                </td>
                <td className="px-4 py-3 text-right">{formatMoney(totalCents)}</td>
                {isQboConnected ? <td /> : null}
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
