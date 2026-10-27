import Link from "next/link";
import { notFound } from "next/navigation";

import { SetupNotice } from "@/app/admin/setup-notice";
import { EmptyState } from "@/components/shell/EmptyState";
import { currentAppUser } from "@/lib/auth";
import { db } from "@/lib/db";

import { CreateBillModal } from "../bills/create-bill-modal";
import { FinancialPageHeader } from "../financial-tabs";
import { CostInboxGrid } from "./cost-inbox-grid";

export const dynamic = "force-dynamic";

/**
 * "Cost Inbox" is Buildertrend's staging area for AI-scanned receipts/bills
 * awaiting a human's approve/reject before they count toward the budget.
 * BT is migrating this into Bills; we keep the page and point staff there.
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

  const [bills, costCodes, purchaseOrders, vendors, schedules] = await Promise.all([
    db.bill.findMany({
      where: {
        jobId: job.id,
        fromOcr: true,
        approvalStatus: { in: ["INBOX", "IN_REVIEW"] },
      },
      orderBy: { createdAt: "desc" },
      include: { lineItems: true },
    }),
    db.costCode.findMany({
      where: { organizationId: user.organizationId, isActive: true },
      orderBy: { sortOrder: "asc" },
      select: { id: true, code: true, name: true },
    }),
    db.purchaseOrder.findMany({
      where: { jobId: job.id },
      select: { id: true, poNumber: true, title: true, vendorId: true, vendorName: true },
      orderBy: { createdAt: "desc" },
    }),
    db.vendor.findMany({
      where: { organizationId: user.organizationId },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    db.schedule.findMany({
      where: { jobId: job.id, organizationId: user.organizationId },
      select: { items: { orderBy: { sortOrder: "asc" }, select: { id: true, title: true } } },
    }),
  ]);

  const scheduleItems = schedules.flatMap((schedule) => schedule.items);

  const rows = bills.map((bill) => ({
    id: bill.id,
    jobId: job.id,
    jobName: job.name,
    title: bill.title ?? bill.vendorName,
    statusLabel: "New",
    purchaseDate: (bill.issuedOn ?? bill.createdAt).toISOString(),
    totalCents: bill.lineItems.reduce((total, item) => total + item.amountCents, 0),
  }));

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4 p-6">
      <FinancialPageHeader
        jobName={job.name}
        title="Cost Inbox"
        action={
          <CreateBillModal
            jobId={job.id}
            jobName={job.name}
            costCodes={costCodes}
            purchaseOrders={purchaseOrders}
            vendors={vendors}
            scheduleItems={scheduleItems}
            triggerLabel="+ Receipt"
          />
        }
      />

      <div
        className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-4 py-3 text-sm"
        style={{ borderColor: "var(--bt-primary)", background: "color-mix(in srgb, var(--bt-primary) 8%, transparent)" }}
      >
        <span className="text-[var(--bt-text)]">
          <span className="font-semibold">Cost Inbox is moving to Bills.</span> Explore the new layout — inbox, bulk upload, and email intake — and switch when your team is ready.
        </span>
        <Link href={`/jobs/${job.id}/bills?status=INBOX`} className="rounded px-3 py-1.5 text-sm font-semibold text-[var(--bt-on-primary)]" style={{ background: "var(--bt-primary)" }}>
          Switch to Bills
        </Link>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title="You're all caught up"
          description="Scanned receipts and bills waiting on review will appear here, or drop them on the Bills page."
          action={
            <Link href={`/jobs/${job.id}/bills?status=INBOX`} className="rounded px-3 py-2 text-sm font-semibold text-[var(--bt-on-primary)]" style={{ background: "var(--bt-primary)" }}>
              Go to Bills
            </Link>
          }
        />
      ) : (
        <CostInboxGrid rows={rows} />
      )}
    </div>
  );
}
