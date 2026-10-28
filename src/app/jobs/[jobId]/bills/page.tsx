import Link from "next/link";
import { notFound } from "next/navigation";

import { SetupNotice } from "@/app/admin/setup-notice";
import { EmptyState } from "@/components/shell/EmptyState";
import { ReceiptIcon } from "@/components/shell/icons";
import { currentAppUser } from "@/lib/auth";
import { billStatusCounts, billingInboxAddress } from "@/lib/bills/intake";
import { db } from "@/lib/db";

import { BillsGrid } from "./bills-grid";
import { BillUploader } from "./bill-uploader";
import { CreateBillModal } from "./create-bill-modal";
import { EmailToInboxButton } from "./email-to-inbox-button";
import { PurchaseOrdersBillsTabs, FinancialPageHeader } from "../financial-tabs";

export const dynamic = "force-dynamic";

/** The pipeline, in the order the office works it. ALL is unfiltered. */
const TABS = [
  { key: "INBOX", label: "Inbox" },
  { key: "IN_REVIEW", label: "In Review" },
  { key: "READY_FOR_PAYMENT", label: "Ready for Payment" },
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

  // Buildertrend opens on Inbox; staff switch to Paid / Ready for Payment from there.
  const activeTab: TabKey = isTabKey(typeof status === "string" ? status : undefined)
    ? (status as TabKey)
    : "INBOX";

  // ALL deliberately hides voided bills: a voided bill isn't something the office
  // still has to act on, and including it would make the total row disagree with
  // what the job actually owes. billStatusCounts() excludes them from ALL too.
  const statusFilter =
    activeTab === "ALL" ? { approvalStatus: { not: "VOID" as const } } : { approvalStatus: activeTab };

  const [bills, counts, costCodes, purchaseOrders, vendors, schedules, qboConnection, organization] = await Promise.all([
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
    db.quickBooksConnection.findUnique({ where: { organizationId: user.organizationId } }),
    db.organization.findUniqueOrThrow({ where: { id: user.organizationId }, select: { slug: true } }),
  ]);
  const isQboConnected = Boolean(qboConnection && !qboConnection.disconnectedAt);
  const inboxAddress = billingInboxAddress(organization.slug);
  const scheduleItems = schedules.flatMap((schedule) => schedule.items);

  const rows = bills.map((bill) => ({
    id: bill.id,
    jobId: job.id,
    jobName: job.name,
    title: bill.title,
    billNumber: bill.billNumber,
    vendorName: bill.vendorName,
    fromOcr: bill.fromOcr,
    poId: bill.purchaseOrder?.id ?? null,
    poNumber: bill.purchaseOrder?.poNumber ?? null,
    poTitle: bill.purchaseOrder?.title ?? null,
    createdByName: bill.createdByUser?.name ?? bill.createdByUser?.email ?? null,
    approvalStatus: bill.approvalStatus,
    dateLabel: (bill.issuedOn ?? bill.createdAt).toISOString(),
    totalCents: bill.lineItems.reduce((total, item) => total + item.amountCents, 0),
    qboBillId: bill.qboBillId,
    sendToQuickBooks: bill.sendToQuickBooks,
  }));

  const createBill = (
    <CreateBillModal
      jobId={job.id}
      jobName={job.name}
      costCodes={costCodes}
      purchaseOrders={purchaseOrders}
      vendors={vendors}
      scheduleItems={scheduleItems}
    />
  );

  const createAction = (
    <div className="flex items-center gap-2">
      <EmailToInboxButton inboxAddress={inboxAddress} />
      {createBill}
    </div>
  );

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4 p-4 sm:p-6">
      <FinancialPageHeader jobName={job.name} title="Bills" action={createAction} />

      <PurchaseOrdersBillsTabs jobId={job.id} active="bills" />

      <BillUploader jobId={job.id} inboxAddress={inboxAddress} />

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

      {rows.length === 0 ? (
        <EmptyState
          icon={<ReceiptIcon className="h-10 w-10" />}
          title={
            activeTab === "INBOX"
              ? "You're all caught up"
              : activeTab === "ALL"
                ? "No bills yet"
                : `Nothing in ${TABS.find((t) => t.key === activeTab)?.label}`
          }
          description="Drop a receipt above, forward one to the inbox address, or add a bill by hand."
          action={createBill}
        />
      ) : (
        <BillsGrid rows={rows} isQboConnected={isQboConnected} />
      )}
    </div>
  );
}
