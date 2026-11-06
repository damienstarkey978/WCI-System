import { notFound } from "next/navigation";

import { SetupNotice } from "@/app/admin/setup-notice";
import type { AddFromSource } from "@/components/financial/PoCostLineItems";
import { extendedCostCents } from "@/lib/budget/funnel";
import { currentAppUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { DEFAULT_PO_SCOPE_OF_WORK } from "@/lib/purchase-orders/default-scope";
import { resolvePoTitle } from "@/lib/purchase-orders/display";
import { nextAutoPoNumber } from "@/lib/purchase-orders/po-number";

import { CreatePoModal } from "./create-po-modal";
import { PurchaseOrdersBillsTabs, FinancialPageHeader } from "../financial-tabs";
import { PurchaseOrdersListClient } from "./po-list-client";

export const dynamic = "force-dynamic";

/**
 * Purchase Orders list — Buildertrend Standard View.
 * Do not mount BillUploader / "Drop bills & receipts" here (Bills page only).
 */
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

  const [purchaseOrders, costCodes, vendors, suggestedPoNumber, defaultTemplate, schedules, estimates, changeOrders] =
    await Promise.all([
      db.purchaseOrder.findMany({
        where: { jobId: job.id },
        orderBy: { createdAt: "desc" },
        include: {
          lineItems: { orderBy: { sortOrder: "asc" }, select: { title: true, quantityMilli: true, unitCostCents: true } },
          linkedScheduleItem: { select: { id: true, title: true } },
          bills: {
            select: { approvalStatus: true, lineItems: { select: { amountCents: true } } },
          },
        },
      }),
      db.costCode.findMany({
        where: { organizationId: user.organizationId, isActive: true },
        orderBy: { sortOrder: "asc" },
        select: { id: true, code: true, name: true },
      }),
      db.vendor.findMany({
        where: { organizationId: user.organizationId },
        orderBy: { name: "asc" },
        select: { id: true, name: true, email: true },
      }),
      nextAutoPoNumber(user.organizationId),
      db.pOAgreementTemplate.findFirst({
        where: { organizationId: user.organizationId, isActive: true, isDefault: true },
        select: { body: true },
      }),
      db.schedule.findMany({
        where: { jobId: job.id, organizationId: user.organizationId },
        select: {
          items: {
            orderBy: { sortOrder: "asc" },
            select: { id: true, title: true },
          },
        },
      }),
      db.estimate.findMany({
        where: { jobId: job.id, organizationId: user.organizationId, status: { in: ["LOCKED", "SENT"] } },
        orderBy: { createdAt: "desc" },
        take: 5,
        select: {
          id: true,
          title: true,
          lineItems: {
            orderBy: { sortOrder: "asc" },
            select: {
              id: true,
              title: true,
              costCodeId: true,
              costType: true,
              unitCostCents: true,
              quantityMilli: true,
            },
          },
        },
      }),
      db.changeOrder.findMany({
        where: { jobId: job.id, organizationId: user.organizationId, status: "APPROVED" },
        orderBy: { createdAt: "desc" },
        take: 10,
        select: {
          id: true,
          number: true,
          title: true,
          lineItems: {
            orderBy: { sortOrder: "asc" },
            select: {
              id: true,
              title: true,
              costCodeId: true,
              costType: true,
              unitCostCents: true,
              quantityMilli: true,
            },
          },
        },
      }),
    ]);

  const defaultScopeOfWork = defaultTemplate?.body ?? DEFAULT_PO_SCOPE_OF_WORK;
  const scheduleItems = schedules.flatMap((schedule) => schedule.items);

  const addFromSources: AddFromSource[] = [
    ...estimates.flatMap((estimate) =>
      estimate.lineItems.map((line) => ({
        id: `estimate:${line.id}`,
        groupLabel: `Estimate — ${estimate.title ?? "Untitled"}`,
        title: line.title,
        costCodeId: line.costCodeId,
        costType: line.costType,
        unitCostCents: line.unitCostCents,
        quantityMilli: line.quantityMilli,
      })),
    ),
    ...changeOrders.flatMap((changeOrder) =>
      changeOrder.lineItems.map((line) => ({
        id: `co:${line.id}`,
        groupLabel: `CO ${String(changeOrder.number).padStart(4, "0")} — ${changeOrder.title}`,
        title: line.title,
        costCodeId: line.costCodeId,
        costType: line.costType,
        unitCostCents: line.unitCostCents,
        quantityMilli: line.quantityMilli,
      })),
    ),
  ];

  const rows = purchaseOrders.map((po) => {
    const totalCents = po.lineItems.reduce(
      (total, item) => total + extendedCostCents(item.quantityMilli, item.unitCostCents),
      0,
    );
    const billedCents = po.bills
      .filter((bill) => bill.approvalStatus !== "VOID")
      .reduce(
        (total, bill) => total + bill.lineItems.reduce((sum, item) => sum + item.amountCents, 0),
        0,
      );
    const outstandingCents = Math.max(0, totalCents - billedCents);
    const billedPercent = totalCents === 0 ? 0 : Math.round((billedCents / totalCents) * 100);

    return {
      id: po.id,
      jobId: job.id,
      jobName: job.name,
      poNumber: po.poNumber,
      poSuffix: po.poSuffix,
      title: resolvePoTitle(po.title, po.lineItems[0]?.title ?? null),
      vendorName: po.vendorName,
      vendorId: po.vendorId,
      status: po.status,
      workStatus: po.workStatus,
      createdAt: po.createdAt.toISOString(),
      totalCents,
      materialsOnly: po.materialsOnly,
      scheduledCompletionOn: po.scheduledCompletionOn?.toISOString() ?? null,
      completedOn: po.completedOn?.toISOString() ?? null,
      linkedScheduleItemId: po.linkedScheduleItemId,
      linkedScheduleItemTitle: po.linkedScheduleItem?.title ?? null,
      scopeOfWork: po.scopeOfWork,
      internalNotes: po.internalNotes,
      outstandingCents,
      billedPercent,
    };
  });

  const createAction = (
    <CreatePoModal
      jobId={job.id}
      jobName={job.name}
      costCodes={costCodes}
      vendors={vendors}
      scheduleItems={scheduleItems}
      addFromSources={addFromSources}
      suggestedPoNumber={suggestedPoNumber}
      defaultScopeOfWork={defaultScopeOfWork}
    />
  );

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4 p-4 sm:p-6">
      {/* Create lives in the list toolbar (+ Export / Filter) like Buildertrend — not a second header CTA. */}
      <FinancialPageHeader jobName={job.name} title="Purchase Orders" />

      <PurchaseOrdersBillsTabs jobId={job.id} active="purchase-orders" />

      <PurchaseOrdersListClient
        rows={rows}
        vendors={vendors}
        scheduleItems={scheduleItems}
        createAction={createAction}
        jobName={job.name}
      />
    </div>
  );
}
