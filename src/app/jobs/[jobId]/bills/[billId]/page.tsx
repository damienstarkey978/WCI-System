import { notFound } from "next/navigation";

import { SetupNotice } from "@/app/admin/setup-notice";
import { actorSummaryText } from "@/components/actor-attribution";
import { currentAppUser } from "@/lib/auth";
import { TEMPLATE_NAMES } from "@/lib/bills/lien-waivers";
import { db } from "@/lib/db";
import { isQuickBooksBillPushEnabled } from "@/lib/env";
import { formatDate, formatMoney } from "@/lib/format";

import { BillDetailView } from "./bill-detail-view";

export const dynamic = "force-dynamic";

export default async function BillDetailPage({
  params,
  searchParams,
}: PageProps<"/jobs/[jobId]/bills/[billId]">) {
  const { jobId, billId } = await params;
  const { tab: tabParam } = await searchParams;
  const initialTab = tabParam === "lien" ? "lien" : "bill";

  let user;
  try {
    user = await currentAppUser();
  } catch (error) {
    return <SetupNotice detail={error instanceof Error ? error.message : String(error)} />;
  }
  if (!user) return <SetupNotice detail="No organization found. Seed the database, then reload." />;

  const bill = await db.bill.findFirst({
    where: { id: billId, organizationId: user.organizationId, jobId },
    include: {
      job: { select: { name: true } },
      vendor: { select: { id: true, name: true } },
      purchaseOrder: { select: { id: true, poNumber: true, title: true } },
      linkedScheduleItem: { select: { id: true, title: true } },
      createdByUser: { select: { name: true, email: true } },
      createdByApiKey: { select: { name: true, agentKind: true } },
      lineItems: { orderBy: { sortOrder: "asc" }, include: { costCode: { select: { code: true, name: true } } } },
      files: { where: { deletedAt: null }, select: { id: true, fileName: true, url: true } },
      approvals: { include: { approverUser: { select: { name: true, email: true } } } },
      lienWaivers: { orderBy: { createdAt: "desc" }, take: 1 },
      invoiceLines: { include: { invoice: { select: { id: true, invoiceNumber: true, status: true } } } },
    },
  });
  if (!bill) notFound();

  const [staff, qboConnection, draftInvoices, costCodes, vendors, purchaseOrders] = await Promise.all([
    db.user.findMany({
      where: { organizationId: user.organizationId, isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, email: true },
    }),
    db.quickBooksConnection.findUnique({ where: { organizationId: user.organizationId } }),
    db.invoice.findMany({
      where: { jobId, organizationId: user.organizationId, status: "DRAFT" },
      orderBy: { createdAt: "desc" },
      select: { id: true, invoiceNumber: true, amountCents: true },
    }),
    db.costCode.findMany({
      where: { organizationId: user.organizationId, isActive: true },
      orderBy: { sortOrder: "asc" },
      select: { id: true, code: true, name: true },
    }),
    db.vendor.findMany({
      where: { organizationId: user.organizationId },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    db.purchaseOrder.findMany({
      where: { jobId, organizationId: user.organizationId },
      orderBy: { createdAt: "desc" },
      select: { id: true, poNumber: true, title: true, vendorId: true, vendorName: true },
    }),
  ]);

  // A line on a voided invoice doesn't count — that charge was withdrawn, so the
  // cost is legitimately still to be recovered.
  const billedOnLine = bill.invoiceLines.find((line) => line.invoice.status !== "VOID") ?? null;
  const isQboConnected = Boolean(qboConnection && !qboConnection.disconnectedAt);
  const qboBillPushEnabled = isQuickBooksBillPushEnabled();
  const waiver = bill.lienWaivers[0] ?? null;

  return (
    <BillDetailView
      jobId={jobId}
      jobName={bill.job.name}
      billId={bill.id}
      currentUserId={user.id}
      title={bill.title}
      billNumber={bill.billNumber}
      vendorName={bill.vendor?.name ?? bill.vendorName}
      vendorId={bill.vendor?.id ?? null}
      vendorHref={bill.vendor ? `/vendors/${bill.vendor.id}` : null}
      vendors={vendors}
      purchaseOrderId={bill.purchaseOrder?.id ?? null}
      purchaseOrderLabel={
        bill.purchaseOrder
          ? `${bill.purchaseOrder.poNumber}${bill.purchaseOrder.title ? ` — ${bill.purchaseOrder.title}` : ""}`
          : null
      }
      purchaseOrderHref={bill.purchaseOrder ? `/jobs/${jobId}/purchase-orders/${bill.purchaseOrder.id}` : null}
      purchaseOrders={purchaseOrders.map((po) => ({
        id: po.id,
        label: `${po.poNumber}${po.title ? ` — ${po.title}` : ""}`,
        vendorId: po.vendorId,
        vendorName: po.vendorName,
      }))}
      scheduleItemTitle={bill.linkedScheduleItem?.title ?? null}
      issuedOnValue={bill.issuedOn ? bill.issuedOn.toISOString().slice(0, 10) : ""}
      dueOnValue={bill.dueOn ? bill.dueOn.toISOString().slice(0, 10) : ""}
      paidAtLabel={bill.paidAt ? formatDate(bill.paidAt) : "—"}
      description={bill.description}
      approvalStatus={bill.approvalStatus}
      fromOcr={bill.fromOcr}
      billableToClient={bill.billableToClient}
      sendToQuickBooks={bill.sendToQuickBooks}
      quickBooksSkipReason={bill.quickBooksSkipReason}
      qboBillId={bill.qboBillId}
      isQboConnected={isQboConnected}
      qboBillPushEnabled={qboBillPushEnabled}
      createdByLabel={
        bill.createdByUser || bill.createdByApiKey
          ? actorSummaryText({ user: bill.createdByUser, apiKey: bill.createdByApiKey })
          : "—"
      }
      lines={bill.lineItems.map((item) => ({
        id: item.id,
        title: item.title,
        costCodeId: item.costCodeId,
        costCodeLabel: `${item.costCode.code} ${item.costCode.name}`,
        costType: item.costType,
        costTypeLabel: item.costType.replace(/_/g, " "),
        amountCents: item.amountCents,
      }))}
      costCodes={costCodes}
      files={bill.files}
      staff={staff.map((person) => ({ id: person.id, label: person.name ?? person.email }))}
      approvals={bill.approvals.map((approval) => ({
        id: approval.id,
        approverUserId: approval.approverUserId,
        label: approval.approverUser.name ?? approval.approverUser.email,
        approvedAt: approval.approvedAt ? formatDate(approval.approvedAt) : null,
        note: approval.note,
      }))}
      waiver={
        waiver
          ? {
              id: waiver.id,
              templateName: waiver.templateName,
              status: waiver.status,
              releasedAt: waiver.releasedAt ? formatDate(waiver.releasedAt) : null,
              body: waiver.body,
            }
          : null
      }
      lienTemplates={TEMPLATE_NAMES}
      draftInvoices={draftInvoices.map((invoice) => ({
        id: invoice.id,
        label: `${invoice.invoiceNumber} — ${formatMoney(invoice.amountCents)}`,
      }))}
      billedOn={
        billedOnLine
          ? {
              invoiceId: billedOnLine.invoice.id,
              invoiceNumber: billedOnLine.invoice.invoiceNumber,
              status: billedOnLine.invoice.status,
            }
          : null
      }
      initialTab={initialTab}
    />
  );
}
